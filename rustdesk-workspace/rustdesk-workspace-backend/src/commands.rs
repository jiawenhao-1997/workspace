use crate::database::DbState;
use crate::models::*;
use chrono::Local;
use rusqlite::{Connection, Row};
use tauri::{Manager, State};
use uuid::Uuid;

fn row_to_task(row: &Row) -> rusqlite::Result<Task> {
    Ok(Task {
        id: row.get(0)?,
        project_id: row.get(1)?,
        title: row.get(2)?,
        description: row.get(3)?,
        priority: row.get(4)?,
        status: row.get(5)?,
        due_date: row.get(6)?,
        tags: row.get(7)?,
        attachments: row.get(8)?,
        sort_order: row.get(9)?,
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
        completed_at: row.get(12)?,
    })
}

const TASK_COLS: &str = "id, project_id, title, description, priority, status, due_date, \
                         tags, attachments, sort_order, created_at, updated_at, completed_at";

fn query_tasks(conn: &Connection, sql: &str) -> Result<Vec<Task>, String> {
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], row_to_task).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        if let Ok(t) = row {
            out.push(t);
        }
    }
    Ok(out)
}

fn now_iso() -> String {
    Local::now().format("%Y-%m-%dT%H:%M:%S").to_string()
}

fn parse_tags(tags: Option<String>) -> Vec<String> {
    tags.map(|t| {
        t.split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect()
    })
    .unwrap_or_default()
}

// ==================== 项目命令 ====================

#[tauri::command]
pub fn list_projects(state: State<DbState>) -> Result<Vec<Project>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, name, description, color, status, progress, progress_mode, owner,
                    start_date, target_date, created_at, updated_at
             FROM projects WHERE deleted_at IS NULL ORDER BY updated_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let projects = stmt
        .query_map([], |row| {
            Ok(Project {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                color: row.get(3)?,
                status: row.get(4)?,
                progress: row.get(5)?,
                progress_mode: row.get::<_, Option<String>>(6)?,
                owner: row.get(7)?,
                start_date: row.get(8)?,
                target_date: row.get(9)?,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(projects)
}

#[tauri::command]
pub fn create_project(
    state: State<DbState>,
    name: String,
    description: Option<String>,
    color: Option<String>,
    owner: Option<String>,
) -> Result<Project, String> {
    let id = Uuid::new_v4().to_string();
    let now = now_iso();
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO projects (id, name, description, color, owner, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![
            &id,
            &name,
            &description,
            color.unwrap_or_else(|| "#3B82F6".to_string()),
            &owner,
            &now,
            &now
        ],
    )
    .map_err(|e| e.to_string())?;

    record_activity_internal(
        &conn,
        "project_created",
        &format!("创建了项目 {}", &name),
        None,
        Some(&id),
        Some("project"),
    )
    .map_err(|e| e.to_string())?;

    Ok(Project {
        id,
        name,
        description,
        color: "#3B82F6".to_string(),
        status: "active".to_string(),
        progress: 0,
        progress_mode: Some("manual".to_string()),
        owner,
        start_date: None,
        target_date: None,
        created_at: now.clone(),
        updated_at: now,
    })
}

// P1-5: 计算项目进度 = 已完成任务数 / 总任务数
fn calc_project_progress(conn: &Connection, project_id: &str) -> i32 {
    let total: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM tasks WHERE project_id = ? AND deleted_at IS NULL",
            [project_id],
            |row| row.get(0),
        )
        .unwrap_or(0);

    if total == 0 {
        return 0;
    }

    let done: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM tasks WHERE project_id = ? AND status = 'done' AND deleted_at IS NULL",
            [project_id],
            |row| row.get(0),
        )
        .unwrap_or(0);

    ((done as f64 / total as f64) * 100.0).round() as i32
}

#[tauri::command]
pub fn update_project(
    state: State<DbState>,
    id: String,
    name: Option<String>,
    description: Option<String>,
    color: Option<String>,
    status: Option<String>,
    progress: Option<i32>,
    progress_mode: Option<String>,
    target_date: Option<String>,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let now = now_iso();

    // 验证：progress_mode 必须是 'manual' 或 'auto'
    if let Some(ref m) = progress_mode {
        if m != "manual" && m != "auto" {
            return Err("progress_mode 必须是 'manual' 或 'auto'".to_string());
        }
    }

    let mut updates: Vec<String> = vec!["updated_at = ?".to_string()];
    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(now)];

    if let Some(n) = name {
        updates.push("name = ?".to_string());
        params_vec.push(Box::new(n));
    }
    if let Some(d) = description {
        updates.push("description = ?".to_string());
        params_vec.push(Box::new(d));
    }
    if let Some(c) = color {
        updates.push("color = ?".to_string());
        params_vec.push(Box::new(c));
    }
    if let Some(s) = status {
        updates.push("status = ?".to_string());
        params_vec.push(Box::new(s));
    }
    // 处理 progress_mode（如果提供了）
    if let Some(ref m) = progress_mode {
        updates.push("progress_mode = ?".to_string());
        params_vec.push(Box::new(m.clone()));
        if m == "auto" {
            // auto 模式：自动计算进度
            let new_progress = calc_project_progress(&conn, &id);
            updates.push("progress = ?".to_string());
            params_vec.push(Box::new(new_progress));
        }
        // manual 模式：只有明确传了 progress 才更新，否则保留原值
    } else if let Some(p) = progress {
        // 无 progress_mode 参数时，保留原 progress（向后兼容）
        updates.push("progress = ?".to_string());
        params_vec.push(Box::new(p));
    }
    // 如果是 manual 模式且明确传了 progress，追加到 updates
    if progress_mode.as_deref() == Some("manual") {
        if let Some(p) = progress {
            if !updates.contains(&"progress = ?".to_string()) {
                updates.push("progress = ?".to_string());
                params_vec.push(Box::new(p));
            }
        }
    }
    if let Some(t) = target_date {
        updates.push("target_date = ?".to_string());
        params_vec.push(Box::new(t));
    }

    params_vec.push(Box::new(id));

    let sql = format!(
        "UPDATE projects SET {} WHERE id = ?",
        updates.join(", ")
    );

    let params_refs: Vec<&dyn rusqlite::ToSql> =
        params_vec.iter().map(|b| b.as_ref()).collect();

    conn.execute(&sql, params_refs.as_slice())
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_project(state: State<DbState>, id: String) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("UPDATE projects SET deleted_at = datetime('now') WHERE id = ?1", rusqlite::params![&id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ==================== 任务命令 ====================

#[tauri::command]
pub fn list_tasks(
    state: State<DbState>,
    project_id: Option<String>,
    status: Option<String>,
) -> Result<Vec<Task>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let mut sql = String::from(
        "SELECT id, project_id, title, description, priority, status, due_date,
                tags, attachments, sort_order, created_at, updated_at, completed_at
         FROM tasks WHERE deleted_at IS NULL",
    );
    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = vec![];

    if let Some(pid) = project_id {
        sql.push_str(" AND project_id = ?");
        params_vec.push(Box::new(pid));
    }
    if let Some(s) = status {
        sql.push_str(" AND status = ?");
        params_vec.push(Box::new(s));
    }
    sql.push_str(" ORDER BY sort_order ASC, created_at DESC");

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let params_refs: Vec<&dyn rusqlite::ToSql> =
        params_vec.iter().map(|b| b.as_ref()).collect();

    let tasks = stmt
        .query_map(params_refs.as_slice(), |row| {
            Ok(Task {
                id: row.get(0)?,
                project_id: row.get(1)?,
                title: row.get(2)?,
                description: row.get(3)?,
                priority: row.get(4)?,
                status: row.get(5)?,
                due_date: row.get(6)?,
                tags: row.get(7)?,
                attachments: row.get(8)?,
                sort_order: row.get(9)?,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
                completed_at: row.get(12)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(tasks)
}

#[tauri::command]
pub fn create_task(
    state: State<DbState>,
    title: String,
    project_id: Option<String>,
    description: Option<String>,
    priority: Option<String>,
    due_date: Option<String>,
    tags: Option<Vec<String>>,
) -> Result<Task, String> {
    let id = Uuid::new_v4().to_string();
    let now = now_iso();
    let tags_str = tags.map(|t| t.join(","));
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO tasks (id, project_id, title, description, priority, status, due_date, tags, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 'todo', ?6, ?7, ?8, ?9)",
        rusqlite::params![
            &id,
            &project_id,
            &title,
            &description,
            priority.unwrap_or_else(|| "medium".to_string()),
            &due_date,
            &tags_str,
            &now,
            &now
        ],
    )
    .map_err(|e| e.to_string())?;

    record_activity_internal(
        &conn,
        "task_created",
        &format!("创建了任务 {}", &title),
        None,
        Some(&id),
        Some("task"),
    )
    .map_err(|e| e.to_string())?;

    Ok(Task {
        id,
        project_id,
        title,
        description,
        priority: "medium".to_string(),
        status: "todo".to_string(),
        due_date,
        tags: tags_str,
        attachments: None,
        sort_order: 0,
        created_at: now.clone(),
        updated_at: now,
        completed_at: None,
    })
}

#[tauri::command]
pub fn update_task(
    state: State<DbState>,
    id: String,
    title: Option<String>,
    description: Option<String>,
    priority: Option<String>,
    status: Option<String>,
    due_date: Option<String>,
    tags: Option<Vec<String>>,
    sort_order: Option<i32>,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let now = now_iso();

    let mut updates: Vec<String> = vec!["updated_at = ?".to_string()];
    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(now.clone())];

    if let Some(n) = title {
        updates.push("title = ?".to_string());
        params_vec.push(Box::new(n));
    }
    if let Some(d) = description {
        updates.push("description = ?".to_string());
        params_vec.push(Box::new(d));
    }
    if let Some(p) = priority {
        updates.push("priority = ?".to_string());
        params_vec.push(Box::new(p));
    }
    if let Some(s) = status {
        updates.push("status = ?".to_string());
        params_vec.push(Box::new(s.clone()));
        if s == "done" {
            updates.push("completed_at = ?".to_string());
            params_vec.push(Box::new(now));
        }
    }
    if let Some(d) = due_date {
        updates.push("due_date = ?".to_string());
        params_vec.push(Box::new(d));
    }
    if let Some(t) = tags {
        updates.push("tags = ?".to_string());
        params_vec.push(Box::new(t.join(",")));
    }
    if let Some(s) = sort_order {
        updates.push("sort_order = ?".to_string());
        params_vec.push(Box::new(s));
    }

    params_vec.push(Box::new(id));

    let sql = format!("UPDATE tasks SET {} WHERE id = ?", updates.join(", "));
    let params_refs: Vec<&dyn rusqlite::ToSql> =
        params_vec.iter().map(|b| b.as_ref()).collect();

    conn.execute(&sql, params_refs.as_slice())
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn toggle_task(state: State<DbState>, id: String) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let now = now_iso();

    // 查询当前状态和关联项目
    let (current, project_id): (String, Option<String>) = conn
        .query_row(
            "SELECT status, project_id FROM tasks WHERE id = ?1",
            rusqlite::params![&id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?)),
        )
        .map_err(|e| e.to_string())?;

    let new_status = if current == "done" { "todo" } else { "done" };
    let completed_at = if new_status == "done" { Some(now.clone()) } else { None };

    if let Some(ca) = completed_at {
        conn.execute(
            "UPDATE tasks SET status = ?1, updated_at = ?2, completed_at = ?3 WHERE id = ?4",
            rusqlite::params![&new_status, &now, &ca, &id],
        )
        .map_err(|e| e.to_string())?;
    } else {
        conn.execute(
            "UPDATE tasks SET status = ?1, updated_at = ?2, completed_at = NULL WHERE id = ?3",
            rusqlite::params![&new_status, &now, &id],
        )
        .map_err(|e| e.to_string())?;
    }

    // P1-5: 如果任务关联了项目且项目为 auto 模式，联动更新项目进度
    if let Some(ref pid) = project_id {
        let mode: Option<String> = conn
            .query_row(
                "SELECT progress_mode FROM projects WHERE id = ?1",
                [pid],
                |row| row.get(0),
            )
            .ok();

        if mode.as_deref() == Some("auto") {
            let new_progress = calc_project_progress(&conn, pid);
            let _ = conn.execute(
                "UPDATE projects SET progress = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![new_progress, &now, pid],
            );
        }
    }

    if new_status == "done" {
        record_activity_internal(
            &conn,
            "task_completed",
            "完成了任务",
            None,
            Some(&id),
            Some("task"),
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn delete_task(state: State<DbState>, id: String) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("UPDATE tasks SET deleted_at = datetime('now') WHERE id = ?1", rusqlite::params![&id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ==================== 笔记命令 ====================

#[tauri::command]
pub fn list_notes(
    state: State<DbState>,
    include_archived: Option<bool>,
) -> Result<Vec<Note>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut sql = String::from(
        "SELECT id, title, content, tags, is_pinned, is_archived, file_path, word_count, created_at, updated_at
         FROM notes WHERE deleted_at IS NULL",
    );
    if !include_archived.unwrap_or(false) {
        sql.push_str(" AND is_archived = 0");
    }
    sql.push_str(" ORDER BY is_pinned DESC, updated_at DESC");

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let notes = stmt
        .query_map([], |row| {
            Ok(Note {
                id: row.get(0)?,
                title: row.get(1)?,
                content: row.get(2)?,
                tags: row.get(3)?,
                is_pinned: row.get::<_, i32>(4)? != 0,
                is_archived: row.get::<_, i32>(5)? != 0,
                file_path: row.get(6)?,
                word_count: row.get(7)?,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(notes)
}

#[tauri::command]
pub fn get_note(state: State<DbState>, id: String) -> Result<Note, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT id, title, content, tags, is_pinned, is_archived, file_path, word_count, created_at, updated_at
         FROM notes WHERE deleted_at IS NULL AND id = ?1",
        rusqlite::params![&id],
        |row| {
            Ok(Note {
                id: row.get(0)?,
                title: row.get(1)?,
                content: row.get(2)?,
                tags: row.get(3)?,
                is_pinned: row.get::<_, i32>(4)? != 0,
                is_archived: row.get::<_, i32>(5)? != 0,
                file_path: row.get(6)?,
                word_count: row.get(7)?,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_note(
    state: State<DbState>,
    title: String,
    content: Option<String>,
    tags: Option<Vec<String>>,
) -> Result<Note, String> {
    let id = Uuid::new_v4().to_string();
    let now = now_iso();
    let tags_str = tags.map(|t| t.join(","));
    let content = content.unwrap_or_default();
    let word_count = content.split_whitespace().count() as i32;
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO notes (id, title, content, tags, word_count, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![&id, &title, &content, &tags_str, word_count, &now, &now],
    )
    .map_err(|e| e.to_string())?;

    record_activity_internal(
        &conn,
        "note_created",
        &format!("创建了笔记 {}", &title),
        None,
        Some(&id),
        Some("note"),
    )
    .map_err(|e| e.to_string())?;

    Ok(Note {
        id,
        title,
        content,
        tags: tags_str,
        is_pinned: false,
        is_archived: false,
        file_path: None,
        word_count,
        created_at: now.clone(),
        updated_at: now,
    })
}

#[tauri::command]
pub fn update_note(
    state: State<DbState>,
    id: String,
    title: Option<String>,
    content: Option<String>,
    tags: Option<Vec<String>>,
    is_pinned: Option<bool>,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let now = now_iso();

    let mut updates: Vec<String> = vec!["updated_at = ?".to_string()];
    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(now)];

    if let Some(t) = title {
        updates.push("title = ?".to_string());
        params_vec.push(Box::new(t));
    }
    if let Some(c) = content {
        updates.push("content = ?".to_string());
        params_vec.push(Box::new(c.clone()));
        let wc = c.split_whitespace().count() as i32;
        updates.push("word_count = ?".to_string());
        params_vec.push(Box::new(wc));
    }
    if let Some(t) = tags {
        updates.push("tags = ?".to_string());
        params_vec.push(Box::new(t.join(",")));
    }
    if let Some(p) = is_pinned {
        updates.push("is_pinned = ?".to_string());
        params_vec.push(Box::new(p as i32));
    }

    params_vec.push(Box::new(id));
    let sql = format!("UPDATE notes SET {} WHERE id = ?", updates.join(", "));
    let params_refs: Vec<&dyn rusqlite::ToSql> =
        params_vec.iter().map(|b| b.as_ref()).collect();
    conn.execute(&sql, params_refs.as_slice())
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_note(state: State<DbState>, id: String) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("UPDATE notes SET deleted_at = datetime('now') WHERE id = ?1", rusqlite::params![&id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn search_notes(
    state: State<DbState>,
    query: String,
) -> Result<Vec<Note>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let pattern = format!("%{}%", query);
    let mut stmt = conn
        .prepare(
            "SELECT id, title, content, tags, is_pinned, is_archived, file_path, word_count, created_at, updated_at
             FROM notes WHERE deleted_at IS NULL AND (title LIKE ?1 OR content LIKE ?1 OR tags LIKE ?1)
             ORDER BY updated_at DESC LIMIT 50",
        )
        .map_err(|e| e.to_string())?;
    let notes = stmt
        .query_map(rusqlite::params![&pattern], |row| {
            Ok(Note {
                id: row.get(0)?,
                title: row.get(1)?,
                content: row.get(2)?,
                tags: row.get(3)?,
                is_pinned: row.get::<_, i32>(4)? != 0,
                is_archived: row.get::<_, i32>(5)? != 0,
                file_path: row.get(6)?,
                word_count: row.get(7)?,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(notes)
}

// ==================== P1-1: FTS5 全文搜索 ====================

/// FTS5 笔记全文搜索（毫秒级响应，支持中文 unicode61 分词 + 高亮）
#[tauri::command]
pub fn search_notes_fts(
    state: State<DbState>,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<crate::search::NoteSearchResult>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    crate::search::search_notes_fts(&conn, &query, limit.unwrap_or(50))
}

/// FTS5 知识库全文搜索
#[tauri::command]
pub fn search_knowledge_fts(
    state: State<DbState>,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<crate::search::KnowledgeSearchResult>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    crate::search::search_knowledge_fts(&conn, &query, limit.unwrap_or(50))
}

#[tauri::command]
pub fn get_note_links(state: State<DbState>, note_id: String) -> Result<Vec<String>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT target_id FROM note_links WHERE source_id = ?1")
        .map_err(|e| e.to_string())?;
    let ids = stmt
        .query_map(rusqlite::params![&note_id], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(ids)
}

// ==================== 活动命令 ====================

#[tauri::command]
pub fn list_activities(
    state: State<DbState>,
    limit: Option<i32>,
) -> Result<Vec<Activity>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let limit = limit.unwrap_or(20);
    let mut stmt = conn
        .prepare(
            "SELECT id, type, title, subtitle, entity_id, entity_type, created_at
             FROM activities ORDER BY created_at DESC LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;
    let activities = stmt
        .query_map(rusqlite::params![limit], |row| {
            Ok(Activity {
                id: row.get(0)?,
                activity_type: row.get(1)?,
                title: row.get(2)?,
                subtitle: row.get(3)?,
                entity_id: row.get(4)?,
                entity_type: row.get(5)?,
                created_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(activities)
}

fn record_activity_internal(
    conn: &rusqlite::Connection,
    activity_type: &str,
    title: &str,
    subtitle: Option<&str>,
    entity_id: Option<&str>,
    entity_type: Option<&str>,
) -> anyhow::Result<()> {
    let id = Uuid::new_v4().to_string();
    let now = now_iso();
    conn.execute(
        "INSERT INTO activities (id, type, title, subtitle, entity_id, entity_type, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![&id, activity_type, title, subtitle, entity_id, entity_type, &now],
    )?;
    Ok(())
}

// ==================== 日历命令 ====================

#[tauri::command]
pub fn list_events(
    state: State<DbState>,
    start: Option<String>,
    end: Option<String>,
) -> Result<Vec<Event>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut sql = String::from(
        "SELECT id, title, description, start_time, end_time, all_day, color, remind_minutes, created_at FROM events WHERE 1=1",
    );
    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = vec![];

    if let Some(s) = start {
        sql.push_str(" AND start_time >= ?");
        params_vec.push(Box::new(s));
    }
    if let Some(e) = end {
        sql.push_str(" AND start_time <= ?");
        params_vec.push(Box::new(e));
    }
    sql.push_str(" ORDER BY start_time ASC");

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let params_refs: Vec<&dyn rusqlite::ToSql> =
        params_vec.iter().map(|b| b.as_ref()).collect();
    let events = stmt
        .query_map(params_refs.as_slice(), |row| {
            Ok(Event {
                id: row.get(0)?,
                title: row.get(1)?,
                description: row.get(2)?,
                start_time: row.get(3)?,
                end_time: row.get(4)?,
                all_day: row.get::<_, i32>(5)? != 0,
                color: row.get(6)?,
                remind_minutes: row.get::<_, Option<i32>>(7)?,
                created_at: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(events)
}

#[tauri::command]
pub fn create_event(
    state: State<DbState>,
    title: String,
    description: Option<String>,
    start_time: String,
    end_time: Option<String>,
    all_day: Option<bool>,
    color: Option<String>,
    remind_minutes: Option<i32>,
) -> Result<Event, String> {
    let id = Uuid::new_v4().to_string();
    let now = now_iso();
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let final_color = color.unwrap_or_else(|| "#3B82F6".to_string());

    conn.execute(
        "INSERT INTO events (id, title, description, start_time, end_time, all_day, color, remind_minutes, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        rusqlite::params![
            &id,
            &title,
            &description,
            &start_time,
            &end_time,
            all_day.unwrap_or(false) as i32,
            &final_color,
            &remind_minutes,
            &now
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(Event {
        id,
        title,
        description,
        start_time,
        end_time,
        all_day: all_day.unwrap_or(false),
        color: final_color,
        remind_minutes,
        created_at: now,
    })
}

#[tauri::command]
pub fn update_event(
    state: State<DbState>,
    id: String,
    title: Option<String>,
    description: Option<String>,
    start_time: Option<String>,
    end_time: Option<String>,
    all_day: Option<bool>,
    color: Option<String>,
    remind_minutes: Option<Option<i32>>, // None = 不改，Some(None) = 清除
) -> Result<Event, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    // 先查当前事件
    let mut stmt = conn
        .prepare("SELECT title, description, start_time, end_time, all_day, color, remind_minutes, created_at FROM events WHERE id = ?1")
        .map_err(|e| e.to_string())?;

    let event = stmt
        .query_row(rusqlite::params![&id], |row| {
            Ok(Event {
                id: id.clone(),
                title: row.get(0)?,
                description: row.get(1)?,
                start_time: row.get(2)?,
                end_time: row.get(3)?,
                all_day: row.get::<_, i32>(4)? != 0,
                color: row.get(5)?,
                remind_minutes: row.get(6)?,
                created_at: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let new_title = title.unwrap_or(event.title);
    let new_description = description.or(event.description);
    let new_start = start_time.unwrap_or(event.start_time);
    let new_end = end_time.or(event.end_time);
    let new_all_day = all_day.unwrap_or(event.all_day);
    let new_color = color.unwrap_or(event.color);
    let new_remind = match remind_minutes {
        Some(None) => None, // 显式清除
        Some(Some(v)) => Some(v),
        None => event.remind_minutes, // 不改
    };

    conn.execute(
        "UPDATE events SET title = ?1, description = ?2, start_time = ?3, end_time = ?4, all_day = ?5, color = ?6, remind_minutes = ?7 WHERE id = ?8",
        rusqlite::params![
            &new_title,
            &new_description,
            &new_start,
            &new_end,
            new_all_day as i32,
            &new_color,
            &new_remind,
            &id
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(Event {
        id,
        title: new_title,
        description: new_description,
        start_time: new_start,
        end_time: new_end,
        all_day: new_all_day,
        color: new_color,
        remind_minutes: new_remind,
        created_at: event.created_at,
    })
}

#[tauri::command]
pub fn delete_event(state: State<DbState>, id: String) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM events WHERE id = ?1", rusqlite::params![&id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ==================== 仪表盘命令 ====================

#[tauri::command]
pub fn get_dashboard(state: State<DbState>) -> Result<DashboardData, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    // 1. 逾期未完成：due_date < 今天 且 未完成
    let overdue_tasks = query_tasks(
        &conn,
        &format!(
            "SELECT {cols} FROM tasks
             WHERE deleted_at IS NULL
               AND status != 'done'
               AND due_date IS NOT NULL
               AND date(due_date) < date('now', 'localtime')
             ORDER BY
               CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
               date(due_date) ASC
             LIMIT 5",
            cols = TASK_COLS
        ),
    )?;

    // 2. 今日任务：due_date = 今天 且 未完成
    let today_tasks = query_tasks(
        &conn,
        &format!(
            "SELECT {cols} FROM tasks
             WHERE deleted_at IS NULL
               AND status != 'done'
               AND date(due_date) = date('now', 'localtime')
             ORDER BY
               CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
               created_at ASC
             LIMIT 8",
            cols = TASK_COLS
        ),
    )?;

    // 3. 待规划：无截止日期 且 未完成
    let unscheduled_tasks = query_tasks(
        &conn,
        &format!(
            "SELECT {cols} FROM tasks
             WHERE deleted_at IS NULL
               AND status != 'done'
               AND due_date IS NULL
             ORDER BY created_at DESC
             LIMIT 5",
            cols = TASK_COLS
        ),
    )?;

    let mut stmt = conn
        .prepare(
            "SELECT id, name, description, color, status, progress, progress_mode, owner,
                    start_date, target_date, created_at, updated_at
             FROM projects WHERE deleted_at IS NULL AND status = 'active' ORDER BY updated_at DESC LIMIT 6",
        )
        .map_err(|e| e.to_string())?;
    let active_projects: Vec<Project> = stmt
        .query_map([], |row| {
            Ok(Project {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                color: row.get(3)?,
                status: row.get(4)?,
                progress: row.get(5)?,
                progress_mode: row.get::<_, Option<String>>(6)?,
                owner: row.get(7)?,
                start_date: row.get(8)?,
                target_date: row.get(9)?,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mut stmt = conn
        .prepare(
            "SELECT id, type, title, subtitle, entity_id, entity_type, created_at
             FROM activities ORDER BY created_at DESC LIMIT 15",
        )
        .map_err(|e| e.to_string())?;
    let recent_activities: Vec<Activity> = stmt
        .query_map([], |row| {
            Ok(Activity {
                id: row.get(0)?,
                activity_type: row.get(1)?,
                title: row.get(2)?,
                subtitle: row.get(3)?,
                entity_id: row.get(4)?,
                entity_type: row.get(5)?,
                created_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    // 今日进度：只算"今日范围内"
    let today_done: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM tasks WHERE deleted_at IS NULL AND status = 'done' AND date(completed_at) = date('now', 'localtime')",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);
    let today_pending = today_tasks.len() as i32;
    let today_total = today_done + today_pending;
    let today_progress = if today_total > 0 {
        ((today_done as f32 / today_total as f32) * 100.0) as i32
    } else {
        0
    };

    Ok(DashboardData {
        overdue_tasks,
        today_tasks,
        unscheduled_tasks,
        active_projects,
        recent_activities,
        today_progress,
        today_done,
        today_pending,
    })
}

// ==================== 设置命令 ====================

#[tauri::command]
pub fn get_setting(state: State<DbState>, key: String) -> Result<Option<String>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let value: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = ?1",
            rusqlite::params![&key],
            |row| row.get(0),
        )
        .ok();

    // 敏感凭据读取后解码
    if value.is_some() && crate::secrets::is_sensitive(&key) {
        if let Some(v) = &value {
            return Ok(crate::secrets::decode(v));
        }
    }

    Ok(value)
}

#[tauri::command]
pub fn set_setting(app: tauri::AppHandle, state: State<DbState>, key: String, value: String) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    // 敏感凭据写入前编码
    let stored_value = if crate::secrets::is_sensitive(&key) {
        crate::secrets::encode(&value)
    } else {
        value.clone()
    };

    conn.execute(
        "INSERT INTO settings(key, value) VALUES(?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')",
        rusqlite::params![&key, &stored_value],
    )
    .map_err(|e| e.to_string())?;

    // 如果是 app_name，同步更新窗口标题
    if key == "app_name" {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.set_title(&value);
        }
    }

    Ok(())
}

#[tauri::command]
pub fn get_all_settings(state: State<DbState>) -> Result<Vec<(String, String)>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT key, value FROM settings")
        .map_err(|e| e.to_string())?;
    let pairs = stmt
        .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        // 敏感凭据不出现在批量查询结果中
        .filter(|(k, _)| !crate::secrets::is_sensitive(k))
        .collect();
    Ok(pairs)
}

// ==================== 快速记录命令 ====================

#[tauri::command]
pub fn quick_capture(
    state: State<DbState>,
    input: String,
    capture_type: Option<String>,
) -> Result<String, String> {
    let ctype = capture_type.unwrap_or_else(|| "task".to_string());
    let now = now_iso();

    match ctype.as_str() {
        "task" => {
            let id = Uuid::new_v4().to_string();
            let conn = state.conn.lock().map_err(|e| e.to_string())?;
            conn.execute(
                "INSERT INTO tasks (id, title, status, priority, created_at, updated_at)
                 VALUES (?1, ?2, 'todo', 'medium', ?3, ?4)",
                rusqlite::params![&id, &input, &now, &now],
            )
            .map_err(|e| e.to_string())?;
            Ok(id)
        }
        "note" => {
            let id = Uuid::new_v4().to_string();
            let conn = state.conn.lock().map_err(|e| e.to_string())?;
            let title = if input.len() > 30 {
                format!("{}...", &input[..30])
            } else {
                input.clone()
            };
            conn.execute(
                "INSERT INTO notes (id, title, content, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                rusqlite::params![&id, &title, &input, &now, &now],
            )
            .map_err(|e| e.to_string())?;
            Ok(id)
        }
        "link" => {
            let id = Uuid::new_v4().to_string();
            let conn = state.conn.lock().map_err(|e| e.to_string())?;
            conn.execute(
                "INSERT INTO knowledge_items (id, source, source_type, title, url, created_at)
                 VALUES (?1, ?2, 'web', ?3, ?4, ?5)",
                rusqlite::params![&id, &input, &input, &input, &now],
            )
            .map_err(|e| e.to_string())?;
            Ok(id)
        }
        _ => Err(format!("Unknown capture type: {}", ctype)),
    }
}

// ==================== AI 助手命令 ====================

pub fn get_setting_value(conn: &rusqlite::Connection, key: &str) -> Option<String> {
    let value: Option<String> = conn.query_row(
        "SELECT value FROM settings WHERE key = ?",
        [key],
        |row| row.get(0),
    )
    .ok()?;

    // 敏感凭据读取后解码
    if crate::secrets::is_sensitive(key) {
        crate::secrets::decode(&value?)
    } else {
        Some(value?)
    }
}

// ==================== AI 请求取消机制 ====================
// 全局取消注册表：前端为每次请求生成唯一 requestId，点击停止时调用
// cancel_ai_request 打标记，流式读取循环轮询标记并提前退出（保留已生成部分）

static CANCELLED_REQUESTS: std::sync::OnceLock<std::sync::Mutex<std::collections::HashSet<String>>> =
    std::sync::OnceLock::new();

fn cancelled_requests() -> &'static std::sync::Mutex<std::collections::HashSet<String>> {
    CANCELLED_REQUESTS.get_or_init(|| std::sync::Mutex::new(std::collections::HashSet::new()))
}

fn is_cancelled(request_id: &str) -> bool {
    if request_id.is_empty() {
        return false;
    }
    cancelled_requests()
        .lock()
        .map(|s| s.contains(request_id))
        .unwrap_or(false)
}

fn mark_cancelled(request_id: &str) {
    if request_id.is_empty() {
        return;
    }
    if let Ok(mut s) = cancelled_requests().lock() {
        s.insert(request_id.to_string());
    }
}

fn clear_cancelled(request_id: &str) {
    if request_id.is_empty() {
        return;
    }
    if let Ok(mut s) = cancelled_requests().lock() {
        s.remove(request_id);
    }
}

/// 取消进行中的 AI 请求（流式输出中断，保留已生成内容）
#[tauri::command]
pub fn cancel_ai_request(request_id: String) -> Result<(), String> {
    mark_cancelled(&request_id);
    Ok(())
}

/// 解析 SSE 流中的一行：提取增量文本并通过 channel 推送
fn process_sse_line(
    line: &str,
    full: &mut String,
    sent_any: &mut bool,
    channel: &tauri::ipc::Channel<String>,
) {
    let line = line.trim_end_matches('\r');
    let data = match line.strip_prefix("data:") {
        Some(d) => d.trim(),
        None => return,
    };
    if data == "[DONE]" {
        return;
    }
    let Ok(v) = serde_json::from_str::<serde_json::Value>(data) else {
        return;
    };
    if let Some(delta) = v["choices"][0]["delta"]["content"].as_str() {
        if !delta.is_empty() {
            full.push_str(delta);
            *sent_any = true;
            let _ = channel.send(delta.to_string());
        }
    }
}

/// 流式调用 LLM API：通过 Tauri Channel 逐段推送增量文本，完成后返回完整文本。
/// 兼容不支持 stream 的服务：若整个响应未产生任何增量，回退为按完整 JSON 响应解析并一次性推送。
/// request_id 用于取消：轮询取消标记，被中断时提前返回已生成的部分内容。
fn call_llm_api(
    base_url: &str,
    model: &str,
    api_key: &str,
    messages: Vec<serde_json::Value>,
    temperature: f32,
    max_tokens: u32,
    channel: &tauri::ipc::Channel<String>,
    request_id: Option<&str>,
) -> Result<String, String> {
    let url_base = base_url.trim_end_matches('/');
    // 识别已经包含版本路径的URL: /v1, /v2, /v3, /v4, /compatible-mode/
    let chat_url = if url_base.ends_with("/v1") || url_base.ends_with("/v2") || url_base.ends_with("/v3") || url_base.ends_with("/v4") || url_base.contains("/compatible-mode/") {
        url_base.to_string()
    } else {
        format!("{}/v1", url_base)
    };
    let chat_url = format!("{}/chat/completions", chat_url);

    // 将 temperature 四舍五入到 2 位小数，避免浮点数精度问题导致 API 报错
    // 先格式化为两位小数字符串，再解析为 f64，确保序列化时不会出现多余小数位
    let temp_str = format!("{:.2}", temperature);
    let temp_f64: f64 = temp_str.parse().unwrap_or(0.7);
    let temperature_value = serde_json::Number::from_f64(temp_f64)
        .unwrap_or_else(|| serde_json::Number::from_f64(0.7).unwrap());

    let mut body = serde_json::json!({
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "stream": true,
    });
    body["temperature"] = serde_json::Value::Number(temperature_value);

    let cancel_id = request_id.unwrap_or("");
    // 开始前已被取消：直接返回空
    if is_cancelled(cancel_id) {
        clear_cancelled(cancel_id);
        return Ok(String::new());
    }

    // 使用异步客户端 + 短周期轮询，使取消标记在连接、首字节等待、流读取全程均可响应：
    // - 发送阶段（连接+响应头）：每 200ms 轮询一次取消标记
    // - 流读取阶段：单次 chunk 读取最多等 1 秒，超时回到循环头检查取消标记
    // 本函数均在 spawn_blocking 中调用，可安全 block_on
    let rt = tokio::runtime::Handle::try_current()
        .map_err(|_| "无 Tokio 运行时上下文".to_string())?;

    rt.block_on(async {
        let client = reqwest::Client::new();
        let send_task = tokio::spawn(
            client
                .post(&chat_url)
                .header("Content-Type", "application/json")
                .header("Authorization", format!("Bearer {}", api_key))
                .json(&body)
                // 流式响应整体耗时较长（含逐步生成），放宽到 300 秒
                .timeout(std::time::Duration::from_secs(300))
                .send(),
        );

        // 发送阶段：每 50ms 轮询一次取消标记，保证快速响应停止按钮
        let mut send_task = send_task;
        let resp = loop {
            if is_cancelled(cancel_id) {
                send_task.abort();
                clear_cancelled(cancel_id);
                return Ok(String::new());
            }
            if send_task.is_finished() {
                break send_task
                    .await
                    .map_err(|e| format!("任务执行失败：{}", e))?
                    .map_err(|e| format!("请求失败：{}", e))?;
            }
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        };

        let status = resp.status();

        if !status.is_success() {
            let text = resp
                .text()
                .await
                .map_err(|e| format!("读取响应失败：{}", e))?;
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
                let msg = v.get("message")
                    .or_else(|| v.get("error").and_then(|e| e.get("message")))
                    .and_then(|v| v.as_str())
                    .unwrap_or(&text)
                    .to_string();
                return Err(msg);
            }
            return Err(format!("HTTP {}: {}", status.as_u16(), text.chars().take(300).collect::<String>()));
        }

        // 增量读取 SSE 流：按行切分，完整行立即解析推送，尾部不完整行留待下一轮
        let mut resp = resp;
        let mut raw = Vec::new();
        let mut line_buf: Vec<u8> = Vec::new();
        let mut sent_any = false;
        let mut full = String::new();
        let mut was_cancelled = false;

        loop {
            // 每轮读取前检查取消标记（单次读取 1s 超时保证这里至多 1 秒被触达一次）
            if is_cancelled(cancel_id) {
                was_cancelled = true;
                break;
            }
            let chunk = match tokio::time::timeout(
                std::time::Duration::from_secs(1),
                resp.chunk(),
            )
            .await
            {
                // 读超时（1s 无数据）：不是错误，回到循环头检查取消标记后继续读
                Err(_) => continue,
                Ok(Err(e)) => return Err(format!("读取流失败：{}", e)),
                Ok(Ok(None)) => break, // 流结束
                Ok(Ok(Some(bytes))) => bytes,
            };
            let chunk: &[u8] = chunk.as_ref();
            raw.extend_from_slice(chunk);
            line_buf.extend_from_slice(chunk);

            // 处理所有完整行
            while let Some(pos) = line_buf.iter().position(|&b| b == b'\n') {
                let line: Vec<u8> = line_buf.drain(..=pos).collect();
                let line = String::from_utf8_lossy(&line[..line.len() - 1]);
                process_sse_line(&line, &mut full, &mut sent_any, channel);
            }
        }
        // 处理最后一段没有换行符结尾的内容
        if !was_cancelled && !line_buf.is_empty() {
            let line = String::from_utf8_lossy(&line_buf);
            process_sse_line(&line, &mut full, &mut sent_any, channel);
        }

        // 请求结束（正常或被取消），清理取消标记
        clear_cancelled(cancel_id);

        // 被用户中断：直接返回已生成的部分内容（可能为空），不走非流式回退
        if was_cancelled {
            return Ok(full);
        }

        // 回退：服务端忽略 stream 参数时按完整响应解析，一次性推送
        if !sent_any {
            let text = String::from_utf8_lossy(&raw);
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
                if let Some(content) = v["choices"][0]["message"]["content"].as_str() {
                    if !content.is_empty() {
                        let _ = channel.send(content.to_string());
                        return Ok(content.to_string());
                    }
                }
            }
            if full.is_empty() {
                return Err("无法解析 AI 响应".to_string());
            }
        }

        Ok(full)
    })
}

/// 判断用户问题是否需要联网搜索
/// 返回 true 表示需要联网，false 表示可以直接回答
fn should_web_search(prompt: &str) -> bool {
    let p = prompt.to_lowercase();

    // 1. 明确不需要联网的模式（优先匹配）
    let no_search_patterns = [
        // 自我介绍/询问模型本身
        "你是谁", "你是什么模型", "你叫什么", "你是哪个", "介绍一下你自己",
        // 简单日期/时间询问（系统已注入，不需要搜）
        "今天是几号", "今天是哪一天", "今天几号", "今天星期几", "今年是哪一年", "今年是哪年", "现在是哪一年",
        "现在几点", "当前时间", "今天日期",
        // 编程/技术类问题
        "怎么写", "如何实现", "代码", "编程", "函数", "算法", "bug", "报错", "怎么改",
        "java", "python", "javascript", "typescript", "rust", "golang", "c++", "react", "vue",
        // 常识/定义类
        "什么是", "是什么", "为什么", "怎么回事", "原理", "区别", "对比",
        // 翻译/语言类
        "翻译", "用英语", "用中文", "怎么说",
        // 数学/计算
        "等于多少", "计算", "求", "方程式", "数学",
        // 闲聊
        "你好", "hello", "hi", "谢谢", "再见", "早上好", "晚上好",
        // 写作/文案
        "写一篇", "帮我写", "写个", "文案", "总结", "润色", "改写",
    ];

    for pattern in no_search_patterns {
        if p.contains(&pattern.to_lowercase()) {
            return false;
        }
    }

    // 2. 明确需要联网的关键词
    let search_patterns = [
        // 时效性关键词
        "最新", "最近", "近期", "现在", "目前", "当前", "实时",
        "今天", "今日", "昨晚", "昨天", "本周", "这个月", "今年",
        "新闻", "头条", "热搜", "热点", "最新消息", "最新进展",
        // 实时信息类
        "天气", "气温", "下雨", "股价", "股票", "汇率", "油价", "金价",
        "比赛", "比分", "赛程", "结果", "冠军",
        "发布", "发布会", "上市", "新品", "新版本", "更新",
        // 事件/动态类
        "发生了什么", "怎么了", "事件", "事故", "新闻报道",
        // 价格/行情
        "价格", "多少钱", "报价", "行情",
        // 地址/位置/营业时间
        "在哪", "地址", "营业时间", "电话", "官网",
        // 排名/榜单
        "排名", "榜单", "排行榜", "top10", "前十",
        // 年份数字（如2026年、2025年发生的事）
        "2026年", "2025年", "2024年",
    ];

    for pattern in search_patterns {
        if p.contains(&pattern.to_lowercase()) {
            return true;
        }
    }

    // 3. 默认：不联网（简单问题直接答，降低不必要的搜索）
    false
}

/// 多轮对话历史消息（由前端传入）
#[derive(Debug, Clone, serde::Deserialize)]
pub struct ChatHistoryMessage {
    pub role: String,
    pub content: String,
}

/// 历史消息最多携带条数，控制 token 消耗
const HISTORY_LIMIT: usize = 20;

/// 将历史消息转换为 LLM messages 格式：
/// - 只保留 user / assistant 角色，防止伪造 system 覆盖系统提示词
/// - 跳过空消息，只取最近 HISTORY_LIMIT 条
fn history_to_messages(history: &Option<Vec<ChatHistoryMessage>>) -> Vec<serde_json::Value> {
    let h = match history {
        Some(h) => h,
        None => return Vec::new(),
    };
    let filtered: Vec<&ChatHistoryMessage> = h
        .iter()
        .filter(|m| (m.role == "user" || m.role == "assistant") && !m.content.trim().is_empty())
        .collect();
    let start = filtered.len().saturating_sub(HISTORY_LIMIT);
    filtered[start..]
        .iter()
        .map(|m| serde_json::json!({ "role": m.role, "content": m.content }))
        .collect()
}

#[tauri::command]
pub async fn ai_assistant(
    state: State<'_, DbState>,
    prompt: String,
    context_type: Option<String>,
    knowledge_base_id: Option<String>,
    history: Option<Vec<ChatHistoryMessage>>,
    channel: tauri::ipc::Channel<String>,
    request_id: Option<String>,
    language: Option<String>,
) -> Result<String, String> {
    // 获取用户语言偏好，默认中文
    let lang = language.unwrap_or_else(|| "zh-CN".to_string());
    let is_english = lang == "en-US";

    // 默认智能模式（auto），自动判断是否需要联网
    let ctype = context_type.unwrap_or_else(|| "auto".to_string());

    // 获取当前日期，用于注入到系统提示词（根据语言格式化）
    let now = chrono::Local::now();
    let current_date = if is_english {
        now.format("%B %d, %Y").to_string()
    } else {
        now.format("%Y年%m月%d日").to_string()
    };
    let current_year = now.format("%Y").to_string();

    // 处理联网搜索的特殊请求
    if ctype == "web_search" || ctype == "web_search_confirmed" {
        let (base_url, model, api_key) = {
            let conn = state.conn.lock().map_err(|e| e.to_string())?;
            (
                get_setting_value(&conn, "ai_base_url"),
                get_setting_value(&conn, "ai_model"),
                get_setting_value(&conn, "ai_api_key"),
            )
        };

        if base_url.is_none() || api_key.is_none() || model.is_none() {
            return Err("AI 未配置".to_string());
        }

        let base_url = base_url.unwrap();
        let model = model.unwrap();
        let api_key = api_key.unwrap();
        let model_name = model.clone();
        let date_str = current_date.clone();
        let history_msgs = history_to_messages(&history);
        let channel_stream = channel.clone();
        let req_id_stream = request_id.clone();

        return tokio::task::spawn_blocking(move || -> Result<String, String> {
            // 执行网络搜索
            let search_results = match crate::web_search::search(&prompt, 5) {
                Ok(results) => crate::web_search::format_search_results(&results),
                Err(e) => format!("网络搜索失败：{}", e),
            };

            let system_content = if is_english {
                format!(
                    "You are the user's personal work assistant. Today's date is: {}. The model you are using is: {}.\n\n\
                    User has enabled web search mode. Here are the search results. Please answer the user's question based on your knowledge and the search results.\n\n\
                    ## Web Search Results\n{}\n\n\
                    ===\n\
                    Important rules:\n\
                    1. Prioritize the latest information from search results\n\
                    2. You can also use your own knowledge to supplement answers\n\
                    3. For simple questions (like asking date, who you are, common knowledge), answer directly\n\
                    4. Answer in English, use Markdown format, be concise and clear",
                    date_str, model_name, search_results
                )
            } else {
                format!(
                    "你是用户的个人工作助手。当前日期是：{}。你当前使用的模型是：{}。\n\n\
                    用户开启了联网搜索模式，以下是网络搜索结果。请结合你的知识和搜索结果用中文回答用户问题。\n\n\
                    ## 网络搜索结果\n{}\n\n\
                    ===\n\
                    重要规则：\n\
                    1. 优先参考搜索结果中的最新信息回答\n\
                    2. 你也可以使用你自身的知识来补充回答\n\
                    3. 如果是简单问题（如问日期、问你是谁、常识问题等），直接回答即可\n\
                    4. 用中文回答，Markdown 格式，简洁清晰",
                    date_str, model_name, search_results
                )
            };

            let system_msg = serde_json::json!({
                "role": "system",
                "content": system_content
            });
            let user_msg = serde_json::json!({
                "role": "user",
                "content": prompt
            });

            let mut messages = vec![system_msg];
            messages.extend(history_msgs);
            messages.push(user_msg);

            call_llm_api(&base_url, &model, &api_key, messages, 0.7, 2000, &channel_stream, req_id_stream.as_deref())
        })
        .await
        .map_err(|e| format!("任务执行失败：{}", e))?;
    }

    // 快捷操作模式（保持原有逻辑）
    let is_quick_action = matches!(
        ctype.as_str(),
        "summarize_today" | "summarize_notes" | "project_risks" | "project_risk" | "general_suggestion" | "generate_suggestion"
    );

    // 收集工作台数据上下文（快捷操作使用）
    let (data_context, focused_task) = if is_quick_action {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        let full = build_overview_context(&conn).unwrap_or_else(|e| format!("（数据获取失败：{}）", e));

        let focused = match ctype.as_str() {
            "summarize_today" => Some(
                "【本次任务】请基于上面的数据，撰写一份**结构化的工作日报**。\n\
                要求：\n\
                1. 用 Markdown 格式，标题清晰\n\
                2. 总结今日完成情况（亮点）\n\
                3. 列出未完成任务及优先级建议\n\
                4. 给出明天的工作建议\n\
                5. 适当使用 emoji\n\
                不要罗列每条任务，做归纳总结。空分类跳过。"
            ),
            "summarize_notes" => Some(
                "【本次任务】请基于上面的笔记数据，写一份**笔记整理建议**：\n\
                1. 活跃度评估\n2. 值得深入的主题\n3. 整理建议（分类/归档/补充）\n\
                用 Markdown 简明输出。"
            ),
            "project_risks" | "project_risk" => Some(
                "【本次任务】请基于上面的项目数据，做**项目风险分析**：\n\
                1. 每个项目风险等级（高/中/低）\n2. 进度落后或即将到期的项目\n3. 具体可执行建议\n\
                Markdown 输出，用 emoji 标记风险。"
            ),
            "general_suggestion" | "generate_suggestion" => Some(
                "【本次任务】请基于上面的工作台全量数据，给出**个性化、有洞察**的工作建议。不要套话。"
            ),
            _ => None,
        };

        (Some(full), focused)
    } else {
        (None, None)
    };

    // 获取 AI 配置
    let (base_url, model, api_key) = {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        (
            get_setting_value(&conn, "ai_base_url"),
            get_setting_value(&conn, "ai_model"),
            get_setting_value(&conn, "ai_api_key"),
        )
    };

    if base_url.is_none() || api_key.is_none() || model.is_none() {
        if is_english {
            return Ok(format!(
                "🤖 AI Assistant\n\nHello! I'm your AI assistant.\n\nIt seems you haven't configured an AI model yet. Please:\n1. Click on 'AI' in the left menu to access settings\n2. Choose a preset model or enter a custom API\n3. Save and test the connection\n\nOnce configured, I'll be able to answer your questions 😊"
            ));
        } else {
            return Ok(format!(
                "🤖 AI 助手\n\n你好！我是你的 AI 助手。\n\n看起来你还没有配置 AI 模型。请先：\n1. 点击左侧菜单的「AI」进入设置\n2. 选择一个预设模型或填入自定义 API\n3. 保存并测试连接\n\n配置完成后，我就能回答你的问题了 😊"
            ));
        }
    }

    let base_url = base_url.unwrap();
    let model = model.unwrap();
    let api_key = api_key.unwrap();

    // 如果是快捷操作，直接生成回答
    if is_quick_action {
        let system_content = if is_english {
            format!(
                "You are the user's personal work assistant, **with full access to the user's workspace database**.\n\
                Today's date is: {}. The model you are using is: {}.\n\n\
                Below is all the real data you can access from the workspace (injected automatically by the system, updated in real-time):\n\n\
                {}\n\n\
                ===\n\n\
                Important rules:\n\
                1. When users ask 'what did I do today', 'analyze daily report', 'summarize', 'how is the project progress', etc., **answer directly based on the above data**, don't ask users to provide more information\n\
                2. Don't say 'please provide the task list' - the task list is the one above\n\
                3. Don't say 'I can't access your data' - you have access\n\
                4. Users may also ask general questions, in which case ignore the data and answer directly\n\
                5. Output should be concise, structured, use Markdown{}\n\n\
                If user language is not English, respond in the user's language.",
                current_date,
                model,
                data_context.unwrap_or_default(),
                focused_task.map(|t| format!("\n\n{}", t)).unwrap_or_default()
            )
        } else {
            format!(
                "你是用户的个人工作助手，**已经拥有访问用户工作台数据库的完整权限**。\n\
                当前日期是：{}。你当前使用的模型是：{}。\n\n\
                下面是你此刻能从工作台获取到的全部真实数据（由系统自动注入，实时更新）：\n\n\
                {}\n\n\
                ===\n\n\
                重要规则：\n\
                1. 当用户问「今天做了什么」「分析日报」「总结一下」「项目进度如何」等问题时，**直接基于上面的数据回答**，不要反问用户去补充\n\
                2. 不要说「请提供任务列表」——任务列表就是上面那份\n\
                3. 不要说「我无法访问你的数据」——你拥有访问权限\n\
                4. 用户也可能问通用问题，此时忽略数据回答即可\n\
                5. 输出简洁、有结构、用 Markdown{}\n\n\
                如果用户使用英文提问，则用英文回答。",
                current_date,
                model,
                data_context.unwrap_or_default(),
                focused_task.map(|t| format!("\n\n{}", t)).unwrap_or_default()
            )
        };

        // 快捷操作的 user message 不能为空（部分 LLM 会拒绝空 user content）
        let user_content = if prompt.trim().is_empty() {
            match ctype.as_str() {
                "summarize_today" => if is_english {
                    "Please summarize today's work and generate a structured daily work report."
                } else {
                    "请总结今天的工作，生成一份结构化的工作日报。"
                },
                "summarize_notes" => if is_english {
                    "Please organize my recent notes and provide suggestions."
                } else {
                    "请整理我最近的笔记，给出整理建议。"
                },
                "project_risks" | "project_risk" => if is_english {
                    "Please analyze the risk situation of current projects."
                } else {
                    "请分析当前项目的风险情况。"
                },
                "general_suggestion" | "generate_suggestion" => if is_english {
                    "Please provide personalized work suggestions based on my workspace data."
                } else {
                    "请基于我的工作台数据给出个性化的工作建议。"
                },
                _ => if is_english {
                    "Please provide suggestions based on the above data."
                } else {
                    "请根据上面的数据给出建议。"
                },
            }
        } else {
            prompt.as_str()
        };

        let messages = vec![
            serde_json::json!({"role": "system", "content": system_content}),
            serde_json::json!({"role": "user", "content": user_content}),
        ];

        let channel_qa = channel.clone();
        let req_id_qa = request_id.clone();
        return tokio::task::spawn_blocking(move || -> Result<String, String> {
            call_llm_api(&base_url, &model, &api_key, messages, 0.7, 2000, &channel_qa, req_id_qa.as_deref())
        })
        .await
        .map_err(|e| format!("任务执行失败：{}", e))?;
    }

    // ========== 普通对话：根据是否选择知识库、以及对话模式决定流程 ==========
    let db_conn = state.conn.clone();
    let history_msgs = history_to_messages(&history);
    let prompt_clone = prompt.clone();
    let base_url_clone = base_url.clone();
    let model_clone = model.clone();
    let api_key_clone = api_key.clone();
    let kb_base_id = knowledge_base_id.clone();
    let date_str = current_date.clone();
    let model_name = model.clone();
    let ctype_clone = ctype.clone();
    let current_date_clone = current_date.clone();
    let current_year_clone = current_year.clone();
    let channel_main = channel;
    let req_id_main = request_id;

    let is_english_clone = is_english;

    let result = tokio::task::spawn_blocking(move || -> Result<String, String> {
        // 阶段 1：短暂持锁，只做数据库读取（文件名 + 知识块），随后立即释放锁。
        // 后续 embedding / 联网搜索 / LLM 调用均为网络请求，若持锁执行会阻塞全局所有数据库操作。

        // 如果是联网搜索，先通知前端开始搜索（让用户知道在做什么）
        if ctype_clone == "web_search" || ctype_clone == "web_search_confirmed" {
            let msg = if is_english_clone { "🔍 Searching the web..." } else { "🔍 正在搜索网络..." };
            let _ = channel_main.send(msg.to_string());
        }

        let kb_data: Option<(Option<String>, Vec<crate::knowledge_cmds::ChunkRow>)> =
            if let Some(base_id) = kb_base_id.as_ref().filter(|id| !id.is_empty()) {
                let conn = db_conn.lock().map_err(|e| format!("数据库锁定失败: {}", e))?;
                let base_title: Option<String> = conn
                    .query_row(
                        "SELECT name FROM knowledge_bases WHERE id = ?1 AND deleted_at IS NULL",
                        rusqlite::params![base_id],
                        |row| row.get(0),
                    )
                    .ok();
                // 整库检索：拉库内所有文件的 chunk
                let chunks = crate::knowledge_cmds::fetch_chunks(&conn, None, Some(base_id.clone()));
                Some((base_title, chunks))
            } else {
                None
            };
        // 锁已随上面作用域结束释放

        // 情况1：用户选择了指定知识库 → 整库检索（跨文件），严格基于内容回答，没找到就明确说明
        if let Some((base_title, chunks)) = kb_data {
            // 整库检索：复用全局 search_knowledge，使用向量相似度+全库 top_k
            match crate::knowledge_cmds::search_knowledge(&prompt_clone, &chunks, &api_key_clone, &base_url_clone) {
                Ok((found, ctx, source_title)) => {
                    if found {
                        let (source_info, sources_note, not_found_msg, success_note) = if is_english_clone {
                            (
                                base_title.as_ref().map(|t| format!("'{}'", t)).unwrap_or_else(|| "selected knowledge base".to_string()),
                                source_title.as_ref().map(|t| format!("\n\n> Most relevant source: '{}'", t)).unwrap_or_default(),
                                base_title.as_ref().map(|t| format!("No relevant content found in '{}' for your question.", t)).unwrap_or_else(|| "No relevant content found in the selected knowledge base for your question.".to_string()),
                                base_title.as_ref().map(|t| format!("(Above content is from knowledge base '{}')", t)).unwrap_or_else(|| "(Above content is from the selected knowledge base)".to_string()),
                            )
                        } else {
                            (
                                base_title.as_ref().map(|t| format!("《{}》", t)).unwrap_or_else(|| "选中的知识库".to_string()),
                                source_title.as_ref().map(|t| format!("\n\n> 最相关来源：《{}》", t)).unwrap_or_default(),
                                base_title.as_ref().map(|t| format!("在《{}》中没有找到与该问题相关的内容", t)).unwrap_or_else(|| "在选中的知识库中没有找到与该问题相关的内容".to_string()),
                                base_title.as_ref().map(|t| format!("以上内容来自知识库《{}》", t)).unwrap_or_else(|| "以上内容来自选中的知识库".to_string()),
                            )
                        };

                        let system_content = if is_english_clone {
                            format!(
                                "You are the user's personal work assistant. Today's date is: {}. The model you are using is: {}.\n\n\
                                User has selected knowledge base {}. Please **answer the user's question based strictly on the following knowledge base search results**.\n\n\
                                ## Knowledge Base Search Results\n{}\n\n\
                                ===\n\
                                Important rules:\n\
                                1. **Mainly** use the content from the knowledge base above to answer. For simple questions like date inquiries or self-introduction, you can answer directly\n\
                                2. If the search results are insufficient to answer professional questions, just say '{}'\n\
                                3. At the end of your answer, please note '{}'\n\
                                4. Answer in English, use Markdown format, be concise and clear",
                                date_str,
                                model_name,
                                source_info,
                                ctx,
                                not_found_msg,
                                success_note
                            )
                        } else {
                            format!(
                                "你是用户的个人工作助手。当前日期是：{}。你当前使用的模型是：{}。\n\n\
                                用户选择了知识库{}，请**严格基于以下知识库检索结果**回答用户问题。\n\n\
                                ## 知识库检索结果\n{}\n\n\
                                ===\n\
                                重要规则：\n\
                                1. **主要**使用上面知识库中的内容回答，对于日期询问、自我介绍等简单问题可以直接回答\n\
                                2. 如果检索结果不足以回答专业问题，直接说「在{}中没有找到与该问题相关的内容」\n\
                                3. 回答末尾请注明「{}」\n\
                                4. 用中文回答，Markdown 格式，简洁清晰",
                                date_str,
                                model_name,
                                source_info,
                                ctx,
                                not_found_msg,
                                success_note
                            )
                        };

                        let mut messages = vec![
                            serde_json::json!({"role": "system", "content": system_content + &sources_note}),
                        ];
                        messages.extend(history_msgs.clone());
                        messages.push(serde_json::json!({"role": "user", "content": prompt_clone}));

                        return call_llm_api(&base_url_clone, &model_clone, &api_key_clone, messages, 0.5, 2000, &channel_main, req_id_main.as_deref());
                    } else {
                        let source_info = if is_english_clone {
                            base_title.as_ref().map(|t| format!("'{}'", t)).unwrap_or_else(|| "selected knowledge base".to_string())
                        } else {
                            base_title.as_ref().map(|t| format!("《{}》", t)).unwrap_or_else(|| "选中的知识库".to_string())
                        };
                        let (hint1, hint2) = if is_english_clone {
                            ("Try different keywords to search again", "Use smart chat mode without selecting a knowledge base")
                        } else {
                            ("换个关键词重新提问", "取消选择知识库后使用智能对话模式")
                        };
                        return Ok(format!(
                            "{}No relevant content found in the knowledge base {} for '{}'.\n\nYou can:\n1. {}\n2. {}",
                            if is_english_clone { "" } else { "在您选择的知识库" },
                            source_info,
                            prompt_clone,
                            hint1,
                            hint2
                        ));
                    }
                }
                Err(e) => {
                    println!("Knowledge search error: {}", e);
                    let source_info = if is_english_clone {
                        base_title.as_ref().map(|t| format!("'{}'", t)).unwrap_or_else(|| "selected knowledge base".to_string())
                    } else {
                        base_title.as_ref().map(|t| format!("《{}》", t)).unwrap_or_else(|| "选中的知识库".to_string())
                    };
                    let err_msg = if is_english_clone { "Error searching knowledge base" } else { "检索知识库时出错" };
                    return Ok(format!("{}: {}", err_msg, e));
                }
            }
        }

        // 情况2：没有选择知识库 → 根据模式决定是否联网
        let need_search = match ctype_clone.as_str() {
            "web_search" | "web_search_confirmed" => true,
            "chat" => false,
            "auto" | _ => should_web_search(&prompt_clone), // 智能模式：自动判断
        };

        if need_search {
            // 联网搜索模式（带超时保护）
            let search_timeout_secs = 15;

            // 先发送提示，让用户知道在搜索
            let searching_msg = if is_english_clone { "🔍 Searching the web, please wait..." } else { "🔍 正在搜索网络，请稍候..." };
            let _ = channel_main.send(searching_msg.to_string());

            // 使用阻塞式搜索，带超时检测
            let search_start = std::time::Instant::now();
            let search_results = match crate::web_search::search(&prompt_clone, 5) {
                Ok(results) => crate::web_search::format_search_results(&results),
                Err(e) => if is_english_clone {
                    format!("Web search failed: {}", e)
                } else {
                    format!("网络搜索失败：{}", e)
                },
            };

            // 如果搜索耗时超过阈值，通知用户
            let elapsed = search_start.elapsed().as_secs();
            if elapsed > 5 {
                let elapsed_msg = if is_english_clone {
                    format!("\n⏱️ Search took {} seconds, generating response...", elapsed)
                } else {
                    format!("\n⏱️ 搜索耗时 {} 秒，继续生成回答...", elapsed)
                };
                let _ = channel_main.send(elapsed_msg);
            }

            let system_content = if is_english_clone {
                format!(
                    "You are the user's personal work assistant. Today's date is: {}. The model you are using is: {}.\n\n\
                    User has enabled web search mode. Here are the search results. Please answer the user's question based on your knowledge and the search results.\n\n\
                    ## Web Search Results\n{}\n\n\
                    ===\n\
                    Important rules:\n\
                    1. Prioritize the latest information from search results\n\
                    2. You can also use your own knowledge to supplement answers\n\
                    3. For simple questions (like asking date, who you are, common knowledge), answer directly\n\
                    4. Answer in English, use Markdown format, be concise and clear",
                    current_date_clone,
                    model_name,
                    search_results
                )
            } else {
                format!(
                    "你是用户的个人工作助手。当前日期是：{}。你当前使用的模型是：{}。\n\n\
                    用户开启了联网搜索，以下是网络搜索结果。请结合你的知识和搜索结果用中文回答用户问题。\n\n\
                    ## 网络搜索结果\n{}\n\n\
                    ===\n\
                    重要规则：\n\
                    1. 优先参考搜索结果中的最新信息回答\n\
                    2. 你也可以使用你自身的知识来补充回答\n\
                    3. 如果是简单问题（如问日期、问你是谁、常识问题等），直接回答即可\n\
                    4. 用中文回答，Markdown 格式，简洁清晰",
                    current_date_clone,
                    model_name,
                    search_results
                )
            };

            let mut messages = vec![
                serde_json::json!({"role": "system", "content": system_content}),
            ];
            messages.extend(history_msgs.clone());
            messages.push(serde_json::json!({"role": "user", "content": prompt_clone}));

            call_llm_api(&base_url_clone, &model_clone, &api_key_clone, messages, 0.7, 2000, &channel_main, req_id_main.as_deref())
        } else {
            // 普通对话模式：注入工作台全量数据（任务、笔记、项目）
            let conn = db_conn.lock().map_err(|e| e.to_string())?;
            let work_data = if is_english_clone {
                build_overview_context(&conn).unwrap_or_else(|e| format!("(Data retrieval failed: {})", e))
            } else {
                build_overview_context(&conn).unwrap_or_else(|e| format!("（数据获取失败：{}）", e))
            };

            let system_content = if is_english_clone {
                format!(
                    "You are the user's personal work assistant, helping users manage tasks, notes, projects, etc.\n\n\
                    ===\n\
                    Current information:\n\
                    - Today's date: {}\n\
                    - Current year: {}\n\
                    - Model you are using: {}\n\n\
                    ===\n\
                    Complete workspace data from the user's workspace (injected automatically by the system, updated in real-time):\n\
                    {}\n\n\
                    ===\n\
                    Important rules:\n\
                    1. **Knowledge base queries**: If users ask about knowledge base related content, reply 'Please select a knowledge base file to query in the top right corner'\n\
                    2. **Task management**: If users ask about tasks, todos, etc., answer directly based on the task data above\n\
                    3. **Note queries**: If users ask about note content, search notes, etc., answer based on the note data above\n\
                    4. **Project queries**: If users ask about projects, progress, etc., answer based on the project data above\n\
                    5. **Chatting/Common knowledge**: Answer directly\n\
                    6. Don't say 'I can't access your data' - you have full access\n\
                    7. Answer in English, use Markdown format, be concise and clear",
                    current_date_clone,
                    current_year_clone,
                    model_name,
                    work_data
                )
            } else {
                format!(
                    "你是用户的个人工作助手，可以帮助用户管理任务、笔记、项目等。\n\n\
                    ===\n\
                    当前信息：\n\
                    - 当前日期：{}\n\
                    - 当前年份：{}\n\
                    - 你当前使用的模型：{}\n\n\
                    ===\n\
                    用户工作台完整数据（由系统自动注入，实时更新）：\n\
                    {}\n\n\
                    ===\n\
                    重要规则：\n\
                    1. **知识库查询**：如果用户询问知识库相关内容，回复「请先在右上角选择要查询的知识库文件」\n\
                    2. **任务管理**：如果用户问任务、待办、Todo 等问题，直接基于上面的任务数据回答\n\
                    3. **笔记查询**：如果用户问笔记内容、搜索笔记等，基于上面的笔记数据回答\n\
                    4. **项目查询**：如果用户问项目、进度等，基于上面的项目数据回答\n\
                    5. **闲聊/常识**：直接回答即可\n\
                    6. 不要说「我无法访问你的数据」——你有完整访问权限\n\
                    7. 用中文回答，Markdown 格式，简洁清晰",
                    current_date_clone,
                    current_year_clone,
                    model_name,
                    work_data
                )
            };

            let mut messages = vec![
                serde_json::json!({"role": "system", "content": system_content}),
            ];
            messages.extend(history_msgs);
            messages.push(serde_json::json!({"role": "user", "content": prompt_clone}));

            call_llm_api(&base_url_clone, &model_clone, &api_key_clone, messages, 0.7, 2000, &channel_main, req_id_main.as_deref())
        }
    })
    .await
    .map_err(|e| format!("任务执行失败：{}", e))??;

    Ok(result)
}
// 构建"今日工作总结"的上下文数据（让 AI 直接基于真实数据生成日报）
fn build_today_context(conn: &rusqlite::Connection) -> Result<String, String> {
    // 今日已完成
    let mut stmt = conn
        .prepare(
            "SELECT title, priority FROM tasks
             WHERE deleted_at IS NULL AND status = 'done' AND date(completed_at) = date('now', 'localtime')
             ORDER BY completed_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let done: Vec<(String, String)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    // 今日创建（未完成）
    let mut stmt = conn
        .prepare(
            "SELECT title, priority, status FROM tasks
             WHERE deleted_at IS NULL AND date(created_at) = date('now', 'localtime') AND status != 'done'
             ORDER BY priority DESC, created_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let new_tasks: Vec<(String, String, String)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    // 今日到期未完成
    let mut stmt = conn
        .prepare(
            "SELECT title, priority FROM tasks
             WHERE deleted_at IS NULL AND due_date = date('now', 'localtime') AND status != 'done'
             ORDER BY priority DESC",
        )
        .map_err(|e| e.to_string())?;
    let due_today: Vec<(String, String)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    // 所有待办任务（按优先级）
    let mut stmt = conn
        .prepare(
            "SELECT title, priority, status, due_date FROM tasks
             WHERE deleted_at IS NULL AND status != 'done'
             ORDER BY
                CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
                due_date ASC NULLS LAST,
                created_at DESC
             LIMIT 20",
        )
        .map_err(|e| e.to_string())?;
    let all_pending: Vec<(String, String, String, Option<String>)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    // 已逾期任务
    let mut stmt = conn
        .prepare(
            "SELECT title, priority, due_date FROM tasks
             WHERE deleted_at IS NULL AND due_date < date('now', 'localtime') AND status != 'done'
             ORDER BY due_date ASC",
        )
        .map_err(|e| e.to_string())?;
    let overdue: Vec<(String, String, String)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mut s = String::new();

    // 已逾期任务（高优先级）
    if !overdue.is_empty() {
        s.push_str("## ⚠️ 已逾期任务\n");
        for (t, p, d) in &overdue {
            let pri = match p.as_str() {
                "high" => "🔴高",
                "medium" => "🟡中",
                _ => "🟢低",
            };
            s.push_str(&format!("- [{}] {} (逾期于 {})\n", pri, t, d));
        }
        s.push('\n');
    }

    // 今日到期任务
    s.push_str("## 📅 今日到期任务\n");
    if due_today.is_empty() {
        s.push_str("（暂无）\n");
    } else {
        for (t, p) in &due_today {
            let pri = match p.as_str() {
                "high" => "🔴高",
                "medium" => "🟡中",
                _ => "🟢低",
            };
            s.push_str(&format!("- [{}] {}\n", pri, t));
        }
    }
    s.push('\n');

    // 今日已完成
    s.push_str("## ✅ 今日已完成\n");
    if done.is_empty() {
        s.push_str("（暂无）\n");
    } else {
        for (t, p) in &done {
            let pri = match p.as_str() {
                "high" => "🔴高",
                "medium" => "🟡中",
                _ => "🟢低",
            };
            s.push_str(&format!("- [{}] {}\n", pri, t));
        }
    }
    s.push('\n');

    // 今日新增
    s.push_str("## 📝 今日新增任务\n");
    if new_tasks.is_empty() {
        s.push_str("（暂无）\n");
    } else {
        for (t, p, st) in &new_tasks {
            let pri = match p.as_str() {
                "high" => "🔴高",
                "medium" => "🟡中",
                _ => "🟢低",
            };
            s.push_str(&format!("- [{}] {} (状态: {})\n", pri, t, st));
        }
    }
    s.push('\n');

    // 所有待办（显示前20条）
    s.push_str("## 📋 所有待办任务（共");
    let total_pending: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM tasks WHERE deleted_at IS NULL AND status != 'done'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);
    s.push_str(&format!("{}条，显示前{}条）\n", total_pending, all_pending.len().min(20)));
    if all_pending.is_empty() {
        s.push_str("（暂无待办）\n");
    } else {
        for (t, p, st, d) in all_pending.iter().take(20) {
            let pri = match p.as_str() {
                "high" => "🔴",
                "medium" => "🟡",
                _ => "🟢",
            };
            let due = d.as_ref().map(|d| format!(" | 截止 {}", d)).unwrap_or_default();
            s.push_str(&format!("- [{}] {}{} (状态: {})\n", pri, t, due, st));
        }
    }

    Ok(s)
}

// 构建"笔记整理"的上下文
fn build_notes_context(conn: &rusqlite::Connection) -> Result<String, String> {
    let total: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM notes WHERE deleted_at IS NULL AND is_archived = 0",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);
    let pinned: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM notes WHERE deleted_at IS NULL AND is_pinned = 1 AND is_archived = 0",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);
    let archived: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM notes WHERE deleted_at IS NULL AND is_archived = 1",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    // 置顶笔记
    let mut stmt = conn
        .prepare(
            "SELECT title, updated_at, word_count FROM notes
             WHERE deleted_at IS NULL AND is_pinned = 1 AND is_archived = 0
             ORDER BY updated_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let pinned_notes: Vec<(String, String, i32)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    // 最近更新的笔记
    let mut stmt = conn
        .prepare(
            "SELECT title, updated_at, word_count FROM notes
             WHERE deleted_at IS NULL AND is_archived = 0
             ORDER BY updated_at DESC LIMIT 10",
        )
        .map_err(|e| e.to_string())?;
    let recent: Vec<(String, String, i32)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mut s = String::new();
    s.push_str(&format!("## 📝 笔记统计\n- 活跃笔记: {} | 置顶: {} | 已归档: {}\n", total, pinned, archived));

    // 置顶笔记
    if !pinned_notes.is_empty() {
        s.push_str("\n### 📌 置顶笔记\n");
        for (t, u, w) in &pinned_notes {
            s.push_str(&format!("- **{}** (字数 {}, 更新于 {})\n", t, w, u));
        }
    }

    // 最近更新
    s.push_str("\n### 📄 最近更新的笔记\n");
    if recent.is_empty() {
        s.push_str("（暂无笔记）\n");
    } else {
        for (t, u, w) in &recent {
            s.push_str(&format!("- **{}** (字数 {}, 更新于 {})\n", t, w, u));
        }
    }

    Ok(s)
}

// 构建"项目风险"的上下文
fn build_projects_context(conn: &rusqlite::Connection) -> Result<String, String> {
    // 所有项目（不限于活跃）
    let mut stmt = conn
        .prepare(
            "SELECT name, status, progress, target_date, start_date, owner FROM projects
             WHERE deleted_at IS NULL
             ORDER BY status ASC, target_date ASC",
        )
        .map_err(|e| e.to_string())?;
    let projects: Vec<(String, String, i32, Option<String>, Option<String>, Option<String>)> = stmt
        .query_map([], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let total: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM projects WHERE deleted_at IS NULL",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);
    let active: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM projects WHERE deleted_at IS NULL AND status = 'active'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    if projects.is_empty() {
        return Ok("## 📁 项目\n（当前没有任何项目）".to_string());
    }

    let mut s = String::new();
    s.push_str(&format!("## 📁 项目统计\n- 总项目: {} | 活跃: {} | 已完成: {}\n\n", total, active, total - active));

    let today = chrono::Local::now().date_naive();

    // 活跃项目
    s.push_str("### 🚀 活跃项目\n");
    let active_projects: Vec<_> = projects.iter().filter(|p| p.1 == "active").collect();
    if active_projects.is_empty() {
        s.push_str("（暂无活跃项目）\n");
    } else {
        for (_, _, progress, target, start, owner) in active_projects {
            let days_left = target
                .as_ref()
                .and_then(|d| chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d").ok())
                .map(|d| (d - today).num_days());
            let days_info = match days_left {
                Some(n) if n < 0 => format!("⚠️ 已逾期 {} 天", -n),
                Some(n) if n == 0 => "⏰ 今天到期".to_string(),
                Some(n) if n <= 7 => format!("⚡ 剩余 {} 天", n),
                Some(n) => format!("📅 剩余 {} 天", n),
                None => "📆 无截止日期".to_string(),
            };
            let owner_info = owner.as_ref().map(|o| format!(" | 👤 {}", o)).unwrap_or_default();
            s.push_str(&format!("- **{}** {} | 📊 {}%{}\n", progress, days_info, progress, owner_info));
        }
    }

    // 已完成项目
    let completed_projects: Vec<_> = projects.iter().filter(|p| p.1 == "completed").collect();
    if !completed_projects.is_empty() {
        s.push_str("\n### ✅ 已完成项目\n");
        for (_, _, progress, _, _, owner) in completed_projects {
            let owner_info = owner.as_ref().map(|o| format!("👤 {}", o)).unwrap_or_default();
            s.push_str(&format!("- **{}** | {} {}完成\n", progress, owner_info, if owner_info.is_empty() { "" } else { "|" }));
        }
    }

    Ok(s)
}

// 构建"工作建议"的全量上下文
fn build_overview_context(conn: &rusqlite::Connection) -> Result<String, String> {
    let mut s = String::new();
    s.push_str("## 今日\n");
    s.push_str(&build_today_context(conn).unwrap_or_default());
    s.push_str("\n## 项目\n");
    s.push_str(&build_projects_context(conn).unwrap_or_default());
    s.push_str("\n## 笔记\n");
    s.push_str(&build_notes_context(conn).unwrap_or_default());
    Ok(s)
}// ==================== AI API 代理 ====================
// 通过后端转发请求，避免 CORS 问题

#[derive(serde::Deserialize)]
pub(crate) struct AiConfig {
    base_url: String,
    api_key: String,
    model: Option<String>,
}

#[tauri::command]
pub async fn test_ai_connection(config: AiConfig) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let client = reqwest::blocking::Client::new();
        
        // 构建 URL
        let base = config.base_url.trim_end_matches('/');
        let url_base = if base.ends_with("/v1") || base.ends_with("/v2") || base.ends_with("/v3") || base.ends_with("/v4") || base.contains("/compatible-mode/") {
            base.to_string()
        } else {
            format!("{}/v1", base)
        };
        let url = format!("{}/chat/completions", url_base);

        // 智能选择默认模型
        let model = config.model.as_deref()
            .filter(|m| !m.trim().is_empty())
            .unwrap_or_else(|| {
                if base.contains("bigmodel.cn") || base.contains("zhipu") {
                    "glm-4-flash"
                } else if base.contains("dashscope.aliyuncs.com") || base.contains("qwen") {
                    "qwen-turbo"
                } else if base.contains("deepseek.com") {
                    "deepseek-chat"
                } else if base.contains("volces.com") || base.contains("doubao") {
                    "doubao-pro-32k"
                } else {
                    "gpt-4o-mini"
                }
            });

        let body = serde_json::json!({
            "model": model,
            "messages": [{"role": "user", "content": "Hi"}],
            "max_tokens": 5,
        });

        let resp = client
            .post(&url)
            .header("Content-Type", "application/json")
            .header("Authorization", format!("Bearer {}", config.api_key))
            .json(&body)
            .timeout(std::time::Duration::from_secs(30))
            .send()
            .map_err(|e| format!("连接失败：{}", e))?;

        if resp.status().is_success() {
            Ok("success".to_string())
        } else {
            let body = resp.text().unwrap_or_default();
            // 尝试解析 JSON 错误信息
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&body) {
                let msg = v.get("message")
                    .or_else(|| v.get("error").and_then(|e| e.get("message")))
                    .and_then(|v| v.as_str())
                    .unwrap_or(&body)
                    .to_string();
                Err(msg)
            } else {
                Err(body)
            }
        }
    })
    .await
    .map_err(|e| format!("任务执行失败：{}", e))?
}

#[tauri::command]
pub async fn fetch_ai_models(config: AiConfig) -> Result<Vec<String>, String> {
    tokio::task::spawn_blocking(move || -> Result<Vec<String>, String> {
        let client = reqwest::blocking::Client::new();
        
        // 构建 URL
        let base = config.base_url.trim_end_matches('/');
        let url_base = if base.ends_with("/v1") || base.ends_with("/v2") || base.ends_with("/v3") || base.ends_with("/v4") || base.contains("/compatible-mode/") {
            base.to_string()
        } else {
            format!("{}/v1", base)
        };
        let url = format!("{}/models", url_base);

        let resp = client
            .get(&url)
            .header("Authorization", format!("Bearer {}", config.api_key))
            .timeout(std::time::Duration::from_secs(30))
            .send()
            .map_err(|e| format!("请求失败：{}", e))?;

        if !resp.status().is_success() {
            let body = resp.text().unwrap_or_default();
            return Err(body);
        }

        let data: serde_json::Value = resp
            .json()
            .map_err(|e| format!("解析响应失败：{}", e))?;

        // 兼容多种格式
        let models: Vec<String> = if let Some(arr) = data.get("data").and_then(|d| d.as_array()) {
            if arr.iter().all(|m| m.is_string()) {
                arr.iter().filter_map(|m| m.as_str().map(String::from)).collect()
            } else {
                arr.iter()
                    .filter_map(|m| {
                        m.get("id")
                            .or_else(|| m.get("model_id"))
                            .or_else(|| m.get("name"))
                            .and_then(|v| v.as_str())
                            .map(String::from)
                    })
                    .collect()
            }
        } else if let Some(arr) = data.get("models").and_then(|d| d.as_array()) {
            arr.iter().filter_map(|v| v.as_str().map(String::from)).collect()
        } else {
            vec![]
        };

        Ok(models)
    })
    .await
    .map_err(|e| format!("任务执行失败：{}", e))?
}

// ==================== 导出/导入 ====================

// ==================== JSON 全量备份 / 恢复 ====================

/// 参与备份的全部业务表（顺序即恢复时的写入顺序）
const BACKUP_TABLES: [&str; 9] = [
    "settings",
    "projects",
    "tasks",
    "notes",
    "note_links",
    "activities",
    "events",
    "knowledge_items",
    "knowledge_chunks",
];

const BACKUP_VERSION: u32 = 1;

/// SQLite 值 → JSON 值（本库无 BLOB 列，BLOB 兜底为十六进制字符串）
fn sql_to_json(v: rusqlite::types::ValueRef<'_>) -> serde_json::Value {
    use rusqlite::types::ValueRef;
    match v {
        ValueRef::Null => serde_json::Value::Null,
        ValueRef::Integer(i) => serde_json::Value::from(i),
        ValueRef::Real(f) => serde_json::Number::from_f64(f)
            .map(serde_json::Value::Number)
            .unwrap_or(serde_json::Value::Null),
        ValueRef::Text(t) => serde_json::Value::from(String::from_utf8_lossy(t)),
        ValueRef::Blob(b) => serde_json::Value::from(
            b.iter().map(|x| format!("{:02x}", x)).collect::<String>(),
        ),
    }
}

/// JSON 值 → SQLite 绑定值
fn json_to_sql(v: &serde_json::Value) -> rusqlite::types::Value {
    use rusqlite::types::Value;
    match v {
        serde_json::Value::Null => Value::Null,
        serde_json::Value::Bool(b) => Value::Integer(if *b { 1 } else { 0 }),
        serde_json::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                Value::Integer(i)
            } else {
                Value::Real(n.as_f64().unwrap_or(0.0))
            }
        }
        serde_json::Value::String(s) => Value::Text(s.clone()),
        // 复杂类型序列化为 JSON 文本存储
        other => Value::Text(other.to_string()),
    }
}

/// 动态导出一张表：每行为 {列名: 值} 的 JSON 对象
fn dump_table(
    conn: &rusqlite::Connection,
    table: &str,
) -> Result<Vec<serde_json::Value>, String> {
    let mut stmt = conn
        .prepare(&format!("SELECT * FROM {}", table))
        .map_err(|e| format!("查询表 {} 失败：{}", table, e))?;
    let col_names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();

    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let mut obj = serde_json::Map::new();
        for (i, col) in col_names.iter().enumerate() {
            let v = row.get_ref(i).map_err(|e| e.to_string())?;
            obj.insert(col.clone(), sql_to_json(v));
        }
        result.push(serde_json::Value::Object(obj));
    }
    Ok(result)
}

/// 全量备份：所有业务表导出为 JSON 文件
#[tauri::command]
pub fn export_backup(state: State<DbState>, file_path: String) -> Result<String, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let mut data = serde_json::Map::new();
    let mut total_rows = 0usize;
    for table in BACKUP_TABLES {
        let mut rows = dump_table(&conn, table)?;
        // settings 表剥离敏感凭据：密钥存于系统钥匙串，不随备份文件明文扩散
        if table == "settings" {
            rows.retain(|row| {
                row.get("key")
                    .and_then(|v| v.as_str())
                    .map(|k| !crate::secrets::is_sensitive(k))
                    .unwrap_or(true)
            });
        }
        total_rows += rows.len();
        data.insert(table.to_string(), serde_json::Value::Array(rows));
    }

    let backup = serde_json::json!({
        "version": BACKUP_VERSION,
        "app": "rustdesk-workspace",
        "exported_at": chrono::Local::now().to_rfc3339(),
        "data": data,
    });

    let content = serde_json::to_string_pretty(&backup)
        .map_err(|e| format!("序列化备份失败：{}", e))?;
    std::fs::write(&file_path, content)
        .map_err(|e| format!("写入备份文件失败：{}", e))?;

    Ok(format!("已备份 {} 条数据", total_rows))
}

/// 从 JSON 备份恢复：清空现有表后按备份重建（事务保证原子性）
#[tauri::command]
pub fn import_backup(state: State<DbState>, file_path: String) -> Result<String, String> {
    let content =
        std::fs::read_to_string(&file_path).map_err(|e| format!("读取备份文件失败：{}", e))?;
    let backup: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| format!("解析备份文件失败：{}", e))?;

    if backup["version"].as_u64() != Some(BACKUP_VERSION as u64) {
        return Err(format!(
            "不支持的备份版本：{:?}（当前支持版本 {}）",
            backup["version"], BACKUP_VERSION
        ));
    }
    let data = backup["data"]
        .as_object()
        .ok_or("备份文件缺少 data 字段")?;

    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;
    let tx = conn
        .transaction()
        .map_err(|e| format!("开启事务失败：{}", e))?;

    let mut total_rows = 0usize;
    for table in BACKUP_TABLES {
        let Some(rows) = data.get(table).and_then(|v| v.as_array()) else {
            continue; // 备份中缺少该表则跳过
        };

        // 清空现有数据（表名来自常量数组，无注入风险）
        tx.execute(&format!("DELETE FROM {}", table), [])
            .map_err(|e| format!("清空表 {} 失败：{}", table, e))?;

        if rows.is_empty() {
            continue;
        }

        // 以当前表结构为准：只写入备份中存在且当前表也有的列，缺失列取 NULL
        let mut col_stmt = tx
            .prepare(&format!("PRAGMA table_info({})", table))
            .map_err(|e| e.to_string())?;
        let cols: Vec<String> = col_stmt
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        drop(col_stmt);

        if cols.is_empty() {
            continue;
        }

        let col_list = cols.join(", ");
        let placeholders = cols.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
        let sql = format!(
            "INSERT INTO {} ({}) VALUES ({})",
            table, col_list, placeholders
        );

        let mut stmt = tx
            .prepare(&sql)
            .map_err(|e| format!("准备写入表 {} 失败：{}", table, e))?;
        for row in rows {
            let obj = row
                .as_object()
                .ok_or("备份行格式错误：期望 JSON 对象")?;
            let params: Vec<rusqlite::types::Value> = cols
                .iter()
                .map(|c| json_to_sql(obj.get(c).unwrap_or(&serde_json::Value::Null)))
                .collect();
            stmt.execute(rusqlite::params_from_iter(params))
                .map_err(|e| format!("写入表 {} 数据失败：{}", table, e))?;
            total_rows += 1;
        }
    }

    tx.commit()
        .map_err(|e| format!("提交事务失败：{}", e))?;

    // 兼容旧版备份：导入的明文凭据移入系统钥匙串并从数据库清除
    crate::secrets::migrate_from_db(&conn);

    Ok(format!("已恢复 {} 条数据，建议重启应用以刷新界面", total_rows))
}

// ==================== 回收站 ====================

/// 回收站条目（软删除的实体）
#[derive(Debug, Clone, serde::Serialize)]
pub struct TrashItem {
    pub id: String,
    /// task | note | project | knowledge
    pub item_type: String,
    pub title: String,
    pub deleted_at: String,
}

/// 回收站支持的实体类型 → 表名与标题列（表名固定映射，无注入风险）
fn trash_table(item_type: &str) -> Option<(&'static str, &'static str)> {
    match item_type {
        "task" => Some(("tasks", "title")),
        "note" => Some(("notes", "title")),
        "project" => Some(("projects", "name")),
        "knowledge" => Some(("knowledge_items", "title")),
        _ => None,
    }
}

/// 列出回收站全部条目（按删除时间倒序）
#[tauri::command]
pub fn list_trash(state: State<DbState>) -> Result<Vec<TrashItem>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, 'task' AS item_type, title, deleted_at FROM tasks WHERE deleted_at IS NOT NULL
             UNION ALL
             SELECT id, 'note', title, deleted_at FROM notes WHERE deleted_at IS NOT NULL
             UNION ALL
             SELECT id, 'project', name, deleted_at FROM projects WHERE deleted_at IS NOT NULL
             UNION ALL
             SELECT id, 'knowledge', title, deleted_at FROM knowledge_items WHERE deleted_at IS NOT NULL
             ORDER BY deleted_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let items = stmt
        .query_map([], |row| {
            Ok(TrashItem {
                id: row.get(0)?,
                item_type: row.get(1)?,
                title: row.get(2)?,
                deleted_at: row.get::<_, Option<String>>(3)?.unwrap_or_default(),
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(items)
}

/// 从回收站恢复一条（清除 deleted_at）
#[tauri::command]
pub fn restore_trash_item(state: State<DbState>, item_type: String, id: String) -> Result<(), String> {
    let (table, _) = trash_table(&item_type)
        .ok_or_else(|| format!("不支持的类型：{}", item_type))?;
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        &format!("UPDATE {} SET deleted_at = NULL WHERE id = ?1", table),
        rusqlite::params![&id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// 彻底删除一条（物理删除，不可恢复）
#[tauri::command]
pub fn purge_trash_item(state: State<DbState>, item_type: String, id: String) -> Result<(), String> {
    let (table, _) = trash_table(&item_type)
        .ok_or_else(|| format!("不支持的类型：{}", item_type))?;
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    // 知识库条目需连带删除其 chunks
    if table == "knowledge_items" {
        conn.execute(
            "DELETE FROM knowledge_chunks WHERE item_id = ?1",
            rusqlite::params![&id],
        )
        .map_err(|e| e.to_string())?;
    }
    conn.execute(
        &format!("DELETE FROM {} WHERE id = ?1", table),
        rusqlite::params![&id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// 清空回收站（物理删除全部软删除条目）
#[tauri::command]
pub fn empty_trash(state: State<DbState>) -> Result<String, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM knowledge_chunks WHERE item_id IN (SELECT id FROM knowledge_items WHERE deleted_at IS NOT NULL)",
        [],
    )
    .map_err(|e| e.to_string())?;
    let mut total = 0;
    for table in ["tasks", "notes", "projects", "knowledge_items"] {
        total += conn
            .execute(
                &format!("DELETE FROM {} WHERE deleted_at IS NOT NULL", table),
                [],
            )
            .map_err(|e| e.to_string())?;
    }
    Ok(format!("已彻底删除 {} 条", total))
}
