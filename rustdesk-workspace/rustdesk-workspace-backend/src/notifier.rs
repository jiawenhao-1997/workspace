// 到期提醒通知：后台每分钟检查「今天到期/近期逾期的任务」与「即将开始的日历事件」，
// 通过系统通知插件提醒，内存去重保证每条只提醒一次（应用重启后重新生效一轮）

use std::collections::HashSet;
use std::sync::{Mutex, OnceLock};

use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;

use crate::database::DbState;

/// 轮询间隔（秒）
const CHECK_INTERVAL_SECS: u64 = 60;
/// 逾期任务仍然提醒的最大天数（更早的静默跳过，避免旧账轰炸）
const OVERDUE_DAYS: i64 = 7;

/// 已通知过的提醒键（如 "task:{id}:{due}" / "event:{id}"）
fn notified_set() -> &'static Mutex<HashSet<String>> {
    static SET: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    SET.get_or_init(|| Mutex::new(HashSet::new()))
}

fn already_notified(key: &str) -> bool {
    notified_set()
        .lock()
        .map(|s| s.contains(key))
        .unwrap_or(false)
}

fn mark_notified(key: &str) {
    if let Ok(mut s) = notified_set().lock() {
        s.insert(key.to_string());
    }
}

/// 应用启动时调用：启动后台提醒轮询
pub fn start(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        // 首轮延迟，等待应用完全就绪
        tokio::time::sleep(std::time::Duration::from_secs(10)).await;
        loop {
            if let Err(e) = check_once(&app) {
                eprintln!("[notifier] 检查失败: {}", e);
            }
            tokio::time::sleep(std::time::Duration::from_secs(CHECK_INTERVAL_SECS)).await;
        }
    });
}

fn check_once(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<DbState>();
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    eprintln!("[notifier] 开始检查提醒...");

    // 总开关（settings 表 notifications_enabled，缺省视为开启）
    let enabled = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'notifications_enabled'",
            [],
            |row| row.get::<_, String>(0),
        )
        .map(|v| v != "false")
        .unwrap_or(true);
    eprintln!("[notifier] 通知开关状态: enabled={}", enabled);
    if !enabled {
        return Ok(());
    }

    let today: String = chrono::Local::now().format("%Y-%m-%d").to_string();

    // 1. 任务：今天到期 + 近 7 天内逾期且未完成的
    let mut task_notices: Vec<(String, String)> = Vec::new(); // (key, body)
    {
        let mut stmt = conn
            .prepare(&format!(
                "SELECT id, title, due_date FROM tasks
                 WHERE deleted_at IS NULL AND status != 'done'
                   AND due_date IS NOT NULL AND due_date != ''
                   AND due_date <= date('now', 'localtime')
                   AND due_date >= date('now', 'localtime', '-{} days')",
                OVERDUE_DAYS - 1
            ))
            .map_err(|e| e.to_string())?;
        let rows: Vec<(String, String, String)> = stmt
            .query_map([], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?))
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        for (id, title, due) in rows {
            let key = format!("task:{}:{}", id, due);
            if already_notified(&key) {
                continue;
            }
            let body = if due < today {
                format!("任务「{}」已逾期（截止 {}），请尽快处理", title, due)
            } else {
                format!("任务「{}」今天到期，别忘了完成", title)
            };
            task_notices.push((key, body));
        }
    }

    // 2. 日历事件：根据每条事件的 remind_minutes 计算提醒时间
    // remind_minutes 为 NULL 时不提醒
    let mut event_notices: Vec<(String, String)> = Vec::new();
    {
        let mut stmt = conn
            .prepare(
                "SELECT id, title, start_time, remind_minutes FROM events
                 WHERE remind_minutes IS NOT NULL"
            )
            .map_err(|e| e.to_string())?;
        let rows: Vec<(String, String, String, Option<i32>)> = stmt
            .query_map([], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        eprintln!("[notifier] 数据库查询到的日历事件数: {}", rows.len());
        for (id, title, start, remind_minutes) in rows {
            eprintln!("[notifier]   事件: id={}, title={}, start={}, remind={}min", id, title, start, remind_minutes.map(|m| m.to_string()).unwrap_or_else(|| "无".to_string()));
            let key = format!("event:{}", id);
            if already_notified(&key) {
                eprintln!("[notifier]   跳过（已提醒过）: {}", key);
                continue;
            }
            let Some(remind_mins) = remind_minutes else {
                continue; // NULL = 不提醒
            };

            let now = chrono::Local::now();
            let event_time = chrono::DateTime::parse_from_rfc3339(&start)
                .map(|dt| dt.with_timezone(&chrono::Local))
                .ok();
            let Some(event_time) = event_time else {
                eprintln!("[notifier]   跳过（时间解析失败）: {}", start);
                continue;
            };

            // 计算提醒时间
            // 正数：提前 N 分钟提醒（如 15 = 提前 15 分钟）
            // 负数：当天某个时间点提醒（如 -540 = 当天 9:00 提醒）
            let remind_time = if remind_mins >= 0 {
                event_time - chrono::Duration::minutes(remind_mins as i64)
            } else {
                // 负数：事件当天 0:00 + |remind_mins| 分钟
                let day_start = event_time.date_naive().and_hms_opt(0, 0, 0).unwrap();
                chrono::DateTime::<chrono::Local>::from_naive_utc_and_offset(
                    day_start + chrono::Duration::minutes((-remind_mins) as i64),
                    chrono::Local::now().offset().clone(),
                )
            };

            let diff_secs = (now - remind_time).num_seconds().abs();
            if diff_secs > 120 {
                // 不在 2 分钟提醒窗口内
                continue;
            }

            // 生成通知文案
            let body = if remind_mins >= 0 {
                let hhmm: String = start.get(11..16).unwrap_or("00:00").to_string();
                let label = if remind_mins < 60 {
                    format!("{} 分钟", remind_mins)
                } else {
                    format!("{} 小时", remind_mins / 60)
                };
                format!("「{}」将于 {} 后开始（{}）", title, label, hhmm)
            } else {
                // 全天事件：显示当天提醒时间
                let hour = (-remind_mins) / 60;
                format!("全天事件「{}」提醒（{}:00）", title, hour)
            };

            event_notices.push((key, body));
        }
    }

    // 锁内只做查询，先标记去重再释放锁，最后发送通知
    // （标记需在发送前完成，避免发送失败导致下一轮重复）
    for (key, _) in task_notices.iter().chain(event_notices.iter()) {
        mark_notified(key);
    }
    drop(conn);

    let count = task_notices.len() + event_notices.len();
    eprintln!("[notifier] 找到 {} 条待发送提醒 (任务: {}, 日历: {})", count, task_notices.len(), event_notices.len());
    if count == 0 {
        return Ok(());
    }

    // 逐条发送系统通知
    for (_, body) in task_notices {
        eprintln!("[notifier] 发送任务提醒: {}", body);
        if let Err(e) = app
            .notification()
            .builder()
            .title("任务提醒")
            .body(&body)
            .show()
        {
            eprintln!("[notifier] 发送通知失败: {}", e);
        }
    }
    for (_, body) in event_notices {
        eprintln!("[notifier] 发送日历提醒: {}", body);
        if let Err(e) = app
            .notification()
            .builder()
            .title("日程提醒")
            .body(&body)
            .show()
        {
            eprintln!("[notifier] 发送通知失败: {}", e);
        }
    }

    eprintln!("[notifier] 提醒发送完成");
    Ok(())
}
