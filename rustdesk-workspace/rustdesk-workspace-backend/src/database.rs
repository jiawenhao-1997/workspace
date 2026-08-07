use rusqlite::{Connection, params};
use std::path::Path;
use std::sync::Mutex;
use crate::config::get_db_path;

pub struct DbState {
    pub conn: Mutex<Connection>,
}

impl DbState {
    pub fn new() -> anyhow::Result<Self> {
        let db_path = get_db_path();
        let conn = Connection::open(&db_path)?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        init_schema(&conn)?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }
}

fn init_schema(conn: &Connection) -> anyhow::Result<()> {
    conn.execute_batch(r#"
        -- 用户与设置
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- 项目
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            color TEXT DEFAULT '#3B82F6',
            status TEXT NOT NULL DEFAULT 'active',
            progress INTEGER DEFAULT 0,
            owner TEXT,
            start_date TEXT,
            target_date TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- 任务
        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            project_id TEXT,
            title TEXT NOT NULL,
            description TEXT,
            priority TEXT NOT NULL DEFAULT 'medium',
            status TEXT NOT NULL DEFAULT 'todo',
            due_date TEXT,
            tags TEXT,
            attachments TEXT,
            sort_order INTEGER DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            completed_at TEXT,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
        );

        -- 笔记
        CREATE TABLE IF NOT EXISTS notes (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            content TEXT NOT NULL DEFAULT '',
            tags TEXT,
            is_pinned INTEGER DEFAULT 0,
            is_archived INTEGER DEFAULT 0,
            file_path TEXT,
            word_count INTEGER DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- 笔记链接（双向链接）
        CREATE TABLE IF NOT EXISTS note_links (
            source_id TEXT NOT NULL,
            target_id TEXT NOT NULL,
            PRIMARY KEY (source_id, target_id),
            FOREIGN KEY (source_id) REFERENCES notes(id) ON DELETE CASCADE,
            FOREIGN KEY (target_id) REFERENCES notes(id) ON DELETE CASCADE
        );

        -- 活动记录
        CREATE TABLE IF NOT EXISTS activities (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            subtitle TEXT,
            entity_id TEXT,
            entity_type TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- 知识库条目
        CREATE TABLE IF NOT EXISTS knowledge_items (
            id TEXT PRIMARY KEY,
            source TEXT NOT NULL,
            source_type TEXT NOT NULL DEFAULT 'web',
            title TEXT NOT NULL,
            content TEXT,
            url TEXT,
            tags TEXT,
            summary TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- 日历事件
        CREATE TABLE IF NOT EXISTS events (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT,
            start_time TEXT NOT NULL,
            end_time TEXT,
            all_day INTEGER DEFAULT 0,
            color TEXT DEFAULT '#3B82F6',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- 索引
        CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
        CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
        CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);
        CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_activities_created ON activities(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_events_start ON events(start_time);

        -- 默认设置
        INSERT OR IGNORE INTO settings(key, value) VALUES
            ('theme', 'system'),
            ('language', 'zh-CN'),
            ('ai_provider', 'mock'),
            ('sync_mode', 'local'),
            ('first_run', 'true');
    "#)?;

    Ok(())
}