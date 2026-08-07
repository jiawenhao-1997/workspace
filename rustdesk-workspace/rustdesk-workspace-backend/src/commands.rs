use crate::database::DbState;
use crate::models::*;
use chrono::Local;
use tauri::{Manager, State};
use uuid::Uuid;

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
            "SELECT id, name, description, color, status, progress, owner,
                    start_date, target_date, created_at, updated_at
             FROM projects ORDER BY updated_at DESC",
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
                owner: row.get(6)?,
                start_date: row.get(7)?,
                target_date: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
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
        owner,
        start_date: None,
        target_date: None,
        created_at: now.clone(),
        updated_at: now,
    })
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
    target_date: Option<String>,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let now = now_iso();

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
    if let Some(p) = progress {
        updates.push("progress = ?".to_string());
        params_vec.push(Box::new(p));
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
    conn.execute("DELETE FROM projects WHERE id = ?1", rusqlite::params![&id])
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
         FROM tasks WHERE 1=1",
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

    let current: String = conn
        .query_row(
            "SELECT status FROM tasks WHERE id = ?1",
            rusqlite::params![&id],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| "todo".to_string());

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

    if new_status == "done" {
        record_activity_internal(
            &conn,
            "task_completed",
            "Completed a task",
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
    conn.execute("DELETE FROM tasks WHERE id = ?1", rusqlite::params![&id])
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
         FROM notes",
    );
    if !include_archived.unwrap_or(false) {
        sql.push_str(" WHERE is_archived = 0");
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
         FROM notes WHERE id = ?1",
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
    conn.execute("DELETE FROM notes WHERE id = ?1", rusqlite::params![&id])
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
             FROM notes WHERE title LIKE ?1 OR content LIKE ?1 OR tags LIKE ?1
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
        "SELECT id, title, description, start_time, end_time, all_day, color, created_at FROM events WHERE 1=1",
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
                created_at: row.get(7)?,
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
) -> Result<Event, String> {
    let id = Uuid::new_v4().to_string();
    let now = now_iso();
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let final_color = color.unwrap_or_else(|| "#3B82F6".to_string());

    conn.execute(
        "INSERT INTO events (id, title, description, start_time, end_time, all_day, color, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![
            &id,
            &title,
            &description,
            &start_time,
            &end_time,
            all_day.unwrap_or(false) as i32,
            &final_color,
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
        created_at: now,
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

    let today = Local::now().format("%Y-%m-%d").to_string();
    let today_pattern = format!("{}%", &today);

    let mut stmt = conn
        .prepare(
            "SELECT id, project_id, title, description, priority, status, due_date,
                    tags, attachments, sort_order, created_at, updated_at, completed_at
             FROM tasks WHERE status != 'done' OR due_date LIKE ?1
             ORDER BY
                CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
                due_date ASC LIMIT 10",
        )
        .map_err(|e| e.to_string())?;
    let today_tasks: Vec<Task> = stmt
        .query_map(rusqlite::params![&today_pattern], |row| {
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

    let mut stmt = conn
        .prepare(
            "SELECT id, name, description, color, status, progress, owner,
                    start_date, target_date, created_at, updated_at
             FROM projects WHERE status = 'active' ORDER BY updated_at DESC LIMIT 6",
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
                owner: row.get(6)?,
                start_date: row.get(7)?,
                target_date: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
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

    let total_completed: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM tasks WHERE status = 'done' AND date(completed_at) = date('now', 'localtime')",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let total_pending: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM tasks WHERE status != 'done'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let total = total_completed + total_pending;
    let today_progress = if total > 0 {
        ((total_completed as f32 / total as f32) * 100.0) as i32
    } else {
        0
    };

    Ok(DashboardData {
        today_tasks,
        active_projects,
        recent_activities,
        today_progress,
        total_completed,
        total_pending,
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
    Ok(value)
}

#[tauri::command]
pub fn set_setting(app: tauri::AppHandle, state: State<DbState>, key: String, value: String) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO settings(key, value) VALUES(?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')",
        rusqlite::params![&key, &value],
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

fn get_setting_value(conn: &rusqlite::Connection, key: &str) -> Option<String> {
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?",
        [key],
        |row| row.get(0),
    )
    .ok()
}

#[tauri::command]
pub async fn ai_assistant(
    state: State<'_, DbState>,
    prompt: String,
    context_type: Option<String>,
) -> Result<String, String> {
    let ctype = context_type.unwrap_or_else(|| "general".to_string());

    // 不管是快捷操作还是通用对话，统一先收集一份"工作台全量数据"塞进 system prompt
    // 这样 AI 永远知道它能查什么，用户说"分析今天的任务"时 AI 直接基于数据回答
    let (data_context, focused_task) = {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        let full = build_overview_context(&conn).unwrap_or_else(|e| format!("（数据获取失败：{}）", e));

        // 不同快捷操作可附加更聚焦的指令
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

        (full, focused)
    };

    // 通用对话：需要调用外部 AI，把它放到独立线程中执行，不阻塞 Tauri 事件循环
    let (base_url, model, api_key) = {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        (
            get_setting_value(&conn, "ai_base_url"),
            get_setting_value(&conn, "ai_model"),
            get_setting_value(&conn, "ai_api_key"),
        )
    };

    // 如果没有配置，返回提示
    if base_url.is_none() || api_key.is_none() || model.is_none() {
        return Ok(format!(
            "🤖 AI 助手\n\n你好！我是你的 AI 助手。\n\n看起来你还没有配置 AI 模型。请先：\n1. 点击左侧菜单的「AI」进入设置\n2. 选择一个预设模型或填入自定义 API\n3. 保存并测试连接\n\n配置完成后，我就能回答你的问题了 😊"
        ));
    }

    let base_url = base_url.unwrap();
    let model = model.unwrap();
    let api_key = api_key.unwrap();

    // 构建 URL - 如果 base_url 没有 /v1 后缀，自动补全
    let url_base = base_url.trim_end_matches('/');
    let url = if url_base.ends_with("/v1") || url_base.ends_with("/v2") || url_base.contains("/compatible-mode/") {
        url_base.to_string()
    } else {
        format!("{}/v1", url_base)
    };
    let url = format!("{}/chat/completions", url);

    // 永远把工作台数据塞进 system prompt，让 AI 主动基于真实数据回答
    let system_content = format!(
        "你是用户的个人工作助手，**已经拥有访问用户工作台数据库的完整权限**。\n\
        下面是你此刻能从工作台获取到的全部真实数据（由系统自动注入，实时更新）：\n\n\
        {}\n\n\
        ===\n\n\
        重要规则：\n\
        1. 当用户问「今天做了什么」「分析日报」「总结一下」「项目进度如何」等问题时，**直接基于上面的数据回答**，不要反问用户去补充\n\
        2. 不要说「请提供任务列表」——任务列表就是上面那份\n\
        3. 不要说「我无法访问你的数据」——你拥有访问权限\n\
        4. 用户也可能问通用问题，此时忽略数据回答即可\n\
        5. 输出简洁、有结构、用 Markdown{}",
        data_context,
        if let Some(task) = focused_task {
            format!("\n\n{}", task)
        } else {
            String::new()
        }
    );

    let body = serde_json::json!({
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": system_content
            },
            {
                "role": "user",
                "content": prompt
            }
        ],
        "temperature": 0.7,
        "max_tokens": 2000
    });

    // 在独立线程中发送 HTTP 请求，不阻塞 Tauri 事件循环
    tokio::task::spawn_blocking(move || -> Result<String, String> {
        let client = reqwest::blocking::Client::new();
        let resp = client
            .post(&url)
            .header("Content-Type", "application/json")
            .header("Authorization", format!("Bearer {}", api_key))
            .json(&body)
            .timeout(std::time::Duration::from_secs(60))
            .send()
            .map_err(|e| format!("请求失败：{}", e))?;

        let status = resp.status();
        let text = resp.text().map_err(|e| format!("读取响应失败：{}", e))?;

        if !status.is_success() {
            // 尝试解析 JSON 错误信息
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
                let msg = v.get("message")
                    .or_else(|| v.get("error").and_then(|e| e.get("message")))
                    .and_then(|v| v.as_str())
                    .unwrap_or(&text)
                    .to_string();
                return Err(msg);
            }
            return Err(format!("HTTP {}: {}", status.as_u16(), text.chars().take(200).collect::<String>()));
        }

        let json: serde_json::Value = serde_json::from_str(&text)
            .map_err(|e| format!("解析响应失败：{}", e))?;

        let content = json["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or("无法解析 AI 响应")
            .to_string();

        Ok(content)
    })
    .await
    .map_err(|e| format!("任务执行失败：{}", e))?
}
// 构建"今日工作总结"的上下文数据（让 AI 直接基于真实数据生成日报）
fn build_today_context(conn: &rusqlite::Connection) -> Result<String, String> {
    // 今日已完成
    let mut stmt = conn
        .prepare(
            "SELECT title, priority FROM tasks
             WHERE status = 'done' AND date(completed_at) = date('now', 'localtime')
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
             WHERE date(created_at) = date('now', 'localtime') AND status != 'done'
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
             WHERE due_date = date('now', 'localtime') AND status != 'done'
             ORDER BY priority DESC",
        )
        .map_err(|e| e.to_string())?;
    let due_today: Vec<(String, String)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    // 总览统计
    let total_pending: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM tasks WHERE status != 'done'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);
    let overdue: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM tasks WHERE due_date < date('now', 'localtime') AND status != 'done'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let mut s = String::new();
    s.push_str("## 今日完成的任务\n");
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

    s.push_str("\n## 今日新增（未完成）\n");
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

    s.push_str("\n## 今日到期未完成\n");
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

    s.push_str(&format!(
        "\n## 整体统计\n- 待办总数: {}\n- 已逾期: {}\n- 今日完成: {}\n",
        total_pending, overdue, done.len()
    ));

    Ok(s)
}

// 构建"笔记整理"的上下文
fn build_notes_context(conn: &rusqlite::Connection) -> Result<String, String> {
    let total: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM notes WHERE is_archived = 0",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);
    let pinned: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM notes WHERE is_pinned = 1 AND is_archived = 0",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);
    let archived: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM notes WHERE is_archived = 1",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    // 最近更新的笔记
    let mut stmt = conn
        .prepare(
            "SELECT title, updated_at, word_count FROM notes
             WHERE is_archived = 0
             ORDER BY updated_at DESC LIMIT 5",
        )
        .map_err(|e| e.to_string())?;
    let recent: Vec<(String, String, i32)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mut s = format!(
        "## 笔记统计\n- 活跃笔记: {}\n- 置顶: {}\n- 已归档: {}\n",
        total, pinned, archived
    );
    s.push_str("\n## 最近更新\n");
    for (t, u, w) in &recent {
        s.push_str(&format!("- {} (字数 {}, 更新于 {})\n", t, w, u));
    }
    Ok(s)
}

// 构建"项目风险"的上下文
fn build_projects_context(conn: &rusqlite::Connection) -> Result<String, String> {
    let mut stmt = conn
        .prepare(
            "SELECT name, status, progress, target_date, start_date FROM projects
             WHERE status = 'active'
             ORDER BY target_date ASC",
        )
        .map_err(|e| e.to_string())?;
    let projects: Vec<(String, String, i32, Option<String>, Option<String>)> = stmt
        .query_map([], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    if projects.is_empty() {
        return Ok("（当前没有活跃项目）".to_string());
    }

    let mut s = "## 活跃项目列表\n".to_string();
    let today = chrono::Local::now().date_naive();
    for (name, status, progress, target, start) in &projects {
        let days_left = target
            .as_ref()
            .and_then(|d| chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d").ok())
            .map(|d| (d - today).num_days());
        let days_info = match days_left {
            Some(n) if n < 0 => format!("已逾期 {} 天", -n),
            Some(n) => format!("剩余 {} 天", n),
            None => "无截止日期".to_string(),
        };
        s.push_str(&format!(
            "- **{}** | 进度 {}% | {} | 开始: {}\n",
            name,
            progress,
            days_info,
            start.as_deref().unwrap_or("未设置")
        ));
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
        let url_base = if base.ends_with("/v1") || base.ends_with("/v2") || base.contains("/compatible-mode/") {
            base.to_string()
        } else {
            format!("{}/v1", base)
        };
        let url = format!("{}/chat/completions", url_base);

        let body = serde_json::json!({
            "model": config.model.as_deref().unwrap_or("gpt-4o-mini"),
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
        let url_base = if base.ends_with("/v1") || base.ends_with("/v2") || base.contains("/compatible-mode/") {
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

#[tauri::command]
pub fn export_data(state: State<DbState>) -> Result<String, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut output = String::new();
    output.push_str("# RustDesk Workspace Export\n\n");

    let mut stmt = conn.prepare("SELECT name, description, color, status, progress FROM projects ORDER BY created_at").map_err(|e| e.to_string())?;
    let projects: Vec<String> = stmt.query_map([], |row| {
        Ok(format!("- {} (进度 {}%, 状态: {}, 颜色: {}){}\n",
            row.get::<_, String>(0)?,
            row.get::<_, i32>(4)?,
            row.get::<_, String>(3)?,
            row.get::<_, String>(2)?,
            row.get::<_, Option<String>>(1)?.map(|d| format!("\n  描述: {}", d)).unwrap_or_default()
        ))
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    output.push_str("## 项目\n\n");
    for p in projects {
        output.push_str(&p);
    }

    output.push_str("\n## 任务\n\n");
    let mut stmt = conn.prepare("SELECT title, priority, status, due_date FROM tasks ORDER BY created_at DESC").map_err(|e| e.to_string())?;
    let tasks: Vec<String> = stmt.query_map([], |row| {
        Ok(format!("- [{}] {} - 优先级: {}{}\n",
            row.get::<_, String>(2)?,
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, Option<String>>(3)?.map(|d| format!(" - 截止: {}", d)).unwrap_or_default()
        ))
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    for t in tasks {
        output.push_str(&t);
    }

    output.push_str("\n## 笔记\n\n");
    let mut stmt = conn.prepare("SELECT title, content, tags FROM notes WHERE is_archived = 0 ORDER BY updated_at DESC").map_err(|e| e.to_string())?;
    let notes: Vec<String> = stmt.query_map([], |row| {
        Ok(format!("### {}{}\n{}\n\n",
            row.get::<_, String>(0)?,
            row.get::<_, Option<String>>(2)?.map(|t| format!(" {}", t)).unwrap_or_default(),
            row.get::<_, String>(1)?
        ))
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    for n in notes {
        output.push_str(&n);
    }

    Ok(output)
}
