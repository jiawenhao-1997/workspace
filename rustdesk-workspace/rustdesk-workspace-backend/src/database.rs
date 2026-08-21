use rusqlite::Connection;
use std::sync::{Mutex, Arc};
use crate::config::get_db_path;

#[derive(Clone)]
pub struct DbState {
    pub conn: Arc<Mutex<Connection>>,
}

impl DbState {
    pub fn new() -> anyhow::Result<Self> {
        let db_path = get_db_path();
        let conn = Connection::open(&db_path)?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        init_schema(&conn)?;
        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
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
            progress_mode TEXT NOT NULL DEFAULT 'manual',
            owner TEXT,
            start_date TEXT,
            target_date TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        "#)?;

    // 迁移：已存在的 projects 表加 progress_mode 列（向后兼容旧数据库）
    let has_progress_mode: bool = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('projects') WHERE name='progress_mode'",
        [],
        |row| row.get::<_, i64>(0),
    ).unwrap_or(0) > 0;

    if !has_progress_mode {
        let _ = conn.execute(
            "ALTER TABLE projects ADD COLUMN progress_mode TEXT NOT NULL DEFAULT 'manual'",
            [],
        );
    }

    // 迁移：修复所有不合法的 progress_mode 值
    let _ = conn.execute(
        "UPDATE projects SET progress_mode = 'manual' WHERE progress_mode NOT IN ('manual', 'auto') OR progress_mode IS NULL",
        [],
    );

    conn.execute_batch(r#"
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
            file_path TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- 知识库分块与向量
        CREATE TABLE IF NOT EXISTS knowledge_chunks (
            id TEXT PRIMARY KEY,
            item_id TEXT NOT NULL,
            chunk_index INTEGER NOT NULL,
            content TEXT NOT NULL,
            embedding TEXT,
            FOREIGN KEY (item_id) REFERENCES knowledge_items(id) ON DELETE CASCADE
        );

        -- 知识库（容器）
        CREATE TABLE IF NOT EXISTS knowledge_bases (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            icon TEXT,
            sort_order INTEGER DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            deleted_at TEXT
        );

        -- 知识库与文件的多对多关联
        CREATE TABLE IF NOT EXISTS knowledge_item_bases (
            item_id TEXT NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
            base_id TEXT NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
            added_at TEXT NOT NULL DEFAULT (datetime('now')),
            PRIMARY KEY (item_id, base_id)
        );
        CREATE INDEX IF NOT EXISTS idx_kib_base ON knowledge_item_bases(base_id);
        CREATE INDEX IF NOT EXISTS idx_kib_item ON knowledge_item_bases(item_id);

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

        -- ========== P1-1: SQLite FTS5 全文搜索 ==========
        -- 使用 trigram 分词器：内置支持中日韩等亚洲语言（3 字符滑窗，无需 ICU 依赖）
        -- 单字 / 2 字查询会通过降级路径处理（不命中 FTS5 但仍可 LIKE 回退）
        -- 外部内容表模式（content='notes'）+ rowid 映射，避免数据冗余
        -- 通过触发器自动同步 notes 表的增删改到 FTS5 索引
        CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
            title,
            content,
            tags,
            content='notes',
            content_rowid='rowid',
            tokenize='trigram'
        );

        -- 知识库 FTS5 虚拟表
        CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
            title,
            content,
            summary,
            tags,
            content='knowledge_items',
            content_rowid='rowid',
            tokenize='trigram'
        );

        -- 默认设置
        INSERT OR IGNORE INTO settings(key, value) VALUES
            ('theme', 'system'),
            ('language', 'zh-CN'),
            ('ai_provider', 'mock'),
            ('sync_mode', 'local'),
            ('first_run', 'true');
    "#)?;

    // ========== 数据库迁移：为旧表添加缺失的列 ==========
    // 检测 knowledge_items 是否有 file_path 列，没有则添加
    let has_file_path: bool = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('knowledge_items') WHERE name='file_path'",
        [],
        |row| row.get::<_, i64>(0),
    ).unwrap_or(0) > 0;

    if !has_file_path {
        println!("Running migration: adding file_path column to knowledge_items");
        conn.execute_batch("ALTER TABLE knowledge_items ADD COLUMN file_path TEXT;")?;
    }

    // 检测 knowledge_items 是否有 summary 列
    let has_summary: bool = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('knowledge_items') WHERE name='summary'",
        [],
        |row| row.get::<_, i64>(0),
    ).unwrap_or(0) > 0;

    if !has_summary {
        println!("Running migration: adding summary column to knowledge_items");
        conn.execute_batch("ALTER TABLE knowledge_items ADD COLUMN summary TEXT;")?;
    }

    // ========== 知识库迁移：种子默认库 + 把现有文件挂到默认库 ==========
    let base_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM knowledge_bases WHERE deleted_at IS NULL",
        [],
        |row| row.get(0),
    ).unwrap_or(0);

    if base_count == 0 {
        println!("Running migration: seeding default knowledge base");
        conn.execute(
            "INSERT INTO knowledge_bases (id, name, description, icon, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, datetime('now'), datetime('now'))",
            rusqlite::params![
                "default",
                "默认知识库",
                "系统自动创建，包含所有未分类的文档",
                "📁",
            ],
        )?;

        // 把所有未删除的文件关联到默认库
        conn.execute(
            "INSERT OR IGNORE INTO knowledge_item_bases (item_id, base_id)
             SELECT id, 'default' FROM knowledge_items WHERE deleted_at IS NULL",
            [],
        )?;
    }

    // ========== 回收站软删除：为业务主表添加 deleted_at 列（NULL = 未删除）==========
    for table in ["projects", "tasks", "notes", "knowledge_items"] {
        let has_deleted_at: bool = conn.query_row(
            &format!("SELECT COUNT(*) FROM pragma_table_info('{}') WHERE name='deleted_at'", table),
            [],
            |row| row.get::<_, i64>(0),
        ).unwrap_or(0) > 0;

        if !has_deleted_at {
            println!("Running migration: adding deleted_at column to {}", table);
            conn.execute_batch(&format!(
                "ALTER TABLE {} ADD COLUMN deleted_at TEXT;",
                table
            ))?;
        }
    }

    // ========== 日历事件提醒：为 events 表添加 remind_minutes 列 ==========
    let has_remind: bool = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('events') WHERE name='remind_minutes'",
        [],
        |row| row.get::<_, i64>(0),
    ).unwrap_or(0) > 0;

    if !has_remind {
        println!("Running migration: adding remind_minutes column to events");
        conn.execute_batch("ALTER TABLE events ADD COLUMN remind_minutes INTEGER;")?;
    }

    // ========== P1-1: 创建 FTS5 同步触发器 ==========
    // 仅在触发器不存在时创建（每次启动检查，避免重复创建失败）
    let trigger_exists: bool = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='trigger' AND name='notes_fts_ai'",
        [],
        |row| row.get::<_, i64>(0),
    ).unwrap_or(0) > 0;

    if !trigger_exists {
        conn.execute_batch(r#"
            -- notes: INSERT/UPDATE/DELETE 触发器
            CREATE TRIGGER notes_fts_ai AFTER INSERT ON notes BEGIN
                INSERT INTO notes_fts(rowid, title, content, tags)
                VALUES (new.rowid, new.title, new.content, COALESCE(new.tags, ''));
            END;
            CREATE TRIGGER notes_fts_ad AFTER DELETE ON notes BEGIN
                INSERT INTO notes_fts(notes_fts, rowid, title, content, tags)
                VALUES('delete', old.rowid, old.title, old.content, COALESCE(old.tags, ''));
            END;
            CREATE TRIGGER notes_fts_au AFTER UPDATE ON notes BEGIN
                INSERT INTO notes_fts(notes_fts, rowid, title, content, tags)
                VALUES('delete', old.rowid, old.title, old.content, COALESCE(old.tags, ''));
                INSERT INTO notes_fts(rowid, title, content, tags)
                VALUES (new.rowid, new.title, new.content, COALESCE(new.tags, ''));
            END;

            -- knowledge_items: INSERT/UPDATE/DELETE 触发器
            CREATE TRIGGER knowledge_fts_ai AFTER INSERT ON knowledge_items BEGIN
                INSERT INTO knowledge_fts(rowid, title, content, summary, tags)
                VALUES (new.rowid, new.title, COALESCE(new.content, ''), COALESCE(new.summary, ''), COALESCE(new.tags, ''));
            END;
            CREATE TRIGGER knowledge_fts_ad AFTER DELETE ON knowledge_items BEGIN
                INSERT INTO knowledge_fts(knowledge_fts, rowid, title, content, summary, tags)
                VALUES('delete', old.rowid, old.title, COALESCE(old.content, ''), COALESCE(old.summary, ''), COALESCE(old.tags, ''));
            END;
            CREATE TRIGGER knowledge_fts_au AFTER UPDATE ON knowledge_items BEGIN
                INSERT INTO knowledge_fts(knowledge_fts, rowid, title, content, summary, tags)
                VALUES('delete', old.rowid, old.title, COALESCE(old.content, ''), COALESCE(old.summary, ''), COALESCE(old.tags, ''));
                INSERT INTO knowledge_fts(rowid, title, content, summary, tags)
                VALUES (new.rowid, new.title, COALESCE(new.content, ''), COALESCE(new.summary, ''), COALESCE(new.tags, ''));
            END;
        "#)?;

        // 回填存量数据（首次升级时将已有笔记/知识库导入 FTS5 索引）
        conn.execute_batch(
            "INSERT INTO notes_fts(rowid, title, content, tags)
             SELECT rowid, title, content, COALESCE(tags, '') FROM notes WHERE deleted_at IS NULL;
             INSERT INTO knowledge_fts(rowid, title, content, summary, tags)
             SELECT rowid, title, COALESCE(content, ''), COALESCE(summary, ''), COALESCE(tags, '')
             FROM knowledge_items WHERE deleted_at IS NULL;"
        )?;
        println!("FTS5: created triggers and backfilled existing data");
    }

    Ok(())
}