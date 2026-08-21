use crate::commands::get_setting_value;
use crate::database::DbState;
use crate::knowledge;
use crate::models::{KnowledgeBase, KnowledgeItem};
use chrono::Local;
use rusqlite::Connection;
use std::path::Path;
use tauri::{Emitter, State};
use uuid::Uuid;

fn now_iso() -> String {
    Local::now().format("%Y-%m-%dT%H:%M:%S").to_string()
}

// ============================================================
// 知识库 CRUD
// ============================================================

#[tauri::command]
pub fn list_knowledge_bases(state: State<DbState>) -> Result<Vec<KnowledgeBase>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT b.id, b.name, b.description, b.icon, b.sort_order,
                    COALESCE(c.cnt, 0) AS item_count,
                    b.created_at, b.updated_at
             FROM knowledge_bases b
             LEFT JOIN (
                 SELECT base_id, COUNT(DISTINCT item_id) AS cnt
                 FROM knowledge_item_bases kib
                 JOIN knowledge_items ki ON ki.id = kib.item_id
                 WHERE ki.deleted_at IS NULL
                 GROUP BY base_id
             ) c ON c.base_id = b.id
             WHERE b.deleted_at IS NULL
             ORDER BY b.sort_order ASC, b.created_at ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(KnowledgeBase {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                icon: row.get(3)?,
                sort_order: row.get(4)?,
                item_count: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

#[tauri::command]
pub fn create_knowledge_base(
    state: State<DbState>,
    name: String,
    description: Option<String>,
    icon: Option<String>,
) -> Result<KnowledgeBase, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();
    let now = now_iso();
    conn.execute(
        "INSERT INTO knowledge_bases (id, name, description, icon, sort_order, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, 0, ?5, ?5)",
        rusqlite::params![&id, &name, &description, &icon, &now],
    )
    .map_err(|e| e.to_string())?;
    Ok(KnowledgeBase {
        id,
        name,
        description,
        icon,
        sort_order: 0,
        item_count: 0,
        created_at: now.clone(),
        updated_at: now,
    })
}

#[tauri::command]
pub fn update_knowledge_base(
    state: State<DbState>,
    id: String,
    name: Option<String>,
    description: Option<String>,
    icon: Option<String>,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let now = now_iso();
    let mut sets = vec!["updated_at = ?".to_string()];
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(now)];
    if let Some(n) = name {
        sets.push("name = ?".to_string());
        params.push(Box::new(n));
    }
    if let Some(d) = description {
        sets.push("description = ?".to_string());
        params.push(Box::new(d));
    }
    if let Some(i) = icon {
        sets.push("icon = ?".to_string());
        params.push(Box::new(i));
    }
    params.push(Box::new(id));
    let sql = format!(
        "UPDATE knowledge_bases SET {} WHERE id = ?",
        sets.join(", ")
    );
    conn.execute(&sql, rusqlite::params_from_iter(params.iter()))
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 删除库。action: "move_to_default" | "delete_all"
#[tauri::command]
pub fn delete_knowledge_base(
    state: State<DbState>,
    id: String,
    action: String,
) -> Result<i32, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    if id == "default" {
        return Err("默认知识库不可删除".to_string());
    }

    // 找出该库下所有未删除的 item_id
    let mut stmt = conn
        .prepare(
            "SELECT DISTINCT kib.item_id FROM knowledge_item_bases kib
             JOIN knowledge_items ki ON ki.id = kib.item_id
             WHERE kib.base_id = ?1 AND ki.deleted_at IS NULL",
        )
        .map_err(|e| e.to_string())?;
    let item_ids: Vec<String> = stmt
        .query_map(rusqlite::params![&id], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    let affected = item_ids.len() as i32;

    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;

    if action == "delete_all" {
        // 软删除所有文件
        for item_id in &item_ids {
            tx.execute(
                "UPDATE knowledge_items SET deleted_at = datetime('now') WHERE id = ?1",
                rusqlite::params![item_id],
            )
            .map_err(|e| e.to_string())?;
        }
    } else if action == "move_to_default" {
        // 把这些文件的 base_id 全部移到默认库（如果还没关联）
        for item_id in &item_ids {
            tx.execute(
                "INSERT OR IGNORE INTO knowledge_item_bases (item_id, base_id) VALUES (?1, 'default')",
                rusqlite::params![item_id],
            )
            .map_err(|e| e.to_string())?;
        }
    } else {
        return Err("未知操作".to_string());
    }

    // 软删除库
    tx.execute(
        "UPDATE knowledge_bases SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?1",
        rusqlite::params![&id],
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;
    Ok(affected)
}

/// 把一个文件关联到多个库
#[tauri::command]
pub fn add_item_to_bases(
    state: State<DbState>,
    item_id: String,
    base_ids: Vec<String>,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    for base_id in &base_ids {
        tx.execute(
            "INSERT OR IGNORE INTO knowledge_item_bases (item_id, base_id) VALUES (?1, ?2)",
            rusqlite::params![&item_id, base_id],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

/// 把文件从某个库移除（不影响其他库关联）
#[tauri::command]
pub fn remove_item_from_base(
    state: State<DbState>,
    item_id: String,
    base_id: String,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM knowledge_item_bases WHERE item_id = ?1 AND base_id = ?2",
        rusqlite::params![&item_id, &base_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ============================================================
// 知识库文件管理
// ============================================================

#[tauri::command]
pub fn list_knowledge_items(
    state: State<DbState>,
    base_id: Option<String>,
) -> Result<Vec<KnowledgeItem>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    // 取文件主体
    let mut stmt = conn
        .prepare(
            "SELECT id, source, source_type, title, content, url, tags, summary, file_path, created_at
             FROM knowledge_items WHERE deleted_at IS NULL ORDER BY created_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let items: Vec<KnowledgeItem> = stmt
        .query_map([], |row| {
            Ok(KnowledgeItem {
                id: row.get(0)?,
                source: row.get(1)?,
                source_type: row.get(2)?,
                title: row.get(3)?,
                content: row.get(4)?,
                url: row.get(5)?,
                tags: row.get(6)?,
                summary: row.get(7)?,
                file_path: row.get(8)?,
                base_ids: Vec::new(), // 后面填充
                created_at: row.get(9)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    // 取所有关联
    let mut stmt = conn
        .prepare("SELECT item_id, base_id FROM knowledge_item_bases")
        .map_err(|e| e.to_string())?;
    let mut map: std::collections::HashMap<String, Vec<String>> =
        std::collections::HashMap::new();
    let rows = stmt
        .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?;
    for r in rows.filter_map(|x| x.ok()) {
        map.entry(r.0).or_default().push(r.1);
    }

    let mut result: Vec<KnowledgeItem> = items
        .into_iter()
        .map(|mut item| {
            item.base_ids = map.get(&item.id).cloned().unwrap_or_default();
            item
        })
        .collect();

    // 过滤：若指定 base_id，只返回该库下的文件
    if let Some(bid) = base_id {
        result.retain(|i| i.base_ids.contains(&bid));
    }
    Ok(result)
}

#[tauri::command]
pub fn delete_knowledge_item(state: State<DbState>, id: String) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE knowledge_items SET deleted_at = datetime('now') WHERE id = ?1",
        rusqlite::params![&id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// P1-3: 上传进度推送
#[derive(serde::Serialize, Clone, Debug)]
pub struct UploadProgress {
    pub phase: String, // "extract" | "embedding" | "save" | "done" | "error"
    pub current: usize,
    pub total: usize,
    pub elapsed_secs: f32,
    pub eta_secs: f32,
    pub message: String,
    pub failed: bool,
    /// done 阶段携带完整的入库记录，前端可直接使用，无需等 invoke Promise
    pub item: Option<KnowledgeItem>,
}

#[tauri::command]
pub async fn upload_knowledge_file(
    state: State<'_, DbState>,
    app: tauri::AppHandle,
    file_path: String,
    base_ids: Option<Vec<String>>,
) -> Result<KnowledgeItem, String> {
    let path = Path::new(&file_path);
    if !path.exists() {
        return Err("文件不存在".to_string());
    }

    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let title = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("未知文件")
        .to_string();

    let db_conn = state.conn.clone();
    let file_path_clone = file_path.clone();
    let ext_clone = ext.clone();
    let title_clone = title.clone();
    let base_ids_clone = base_ids.clone();

    let result = tokio::task::spawn_blocking(move || -> Result<KnowledgeItem, String> {
        let upload_start = std::time::Instant::now();

        // 用 Arc<dyn Fn> 让 emit 可以多次调用（进 spawn_blocking 时 move）
        let app_for_emit = app.clone();
        let emit: std::sync::Arc<dyn Fn(UploadProgress) + Send + Sync> =
            std::sync::Arc::new(move |p: UploadProgress| {
                let _ = app_for_emit.emit("upload-progress", p);
            });

        println!("开始处理知识库文件: {} ({})", title_clone, file_path_clone);

        // 1. 提取文本
        emit(UploadProgress {
            phase: "extract".into(), current: 0, total: 1,
            elapsed_secs: 0.0, eta_secs: 0.0,
            message: "正在提取文本...".into(), failed: false,
            item: None,
        });
        let text = knowledge::extract_text(&file_path_clone)
            .map_err(|e| format!("文本提取失败: {}", e))?;
        if text.trim().is_empty() {
            emit(UploadProgress {
                phase: "error".into(), current: 0, total: 0,
                elapsed_secs: upload_start.elapsed().as_secs_f32(), eta_secs: 0.0,
                message: "文件内容为空，无法建立索引".into(), failed: true, item: None,
            });
            return Err("文件内容为空，无法建立索引".to_string());
        }
        println!("  提取完成，文本长度: {} 字符", text.len());

        // 2. 分块
        let chunks = knowledge::chunk_text(&text, 500, 50);
        let total_chunks = chunks.len();
        println!("  分块完成，共 {} 个块", total_chunks);

        // 3. 批量 + 并发 embedding
        let (api_key, base_url) = {
            let conn = db_conn.lock().map_err(|e| format!("数据库锁定失败: {}", e))?;
            (
                get_setting_value(&conn, "ai_api_key"),
                get_setting_value(&conn, "ai_base_url"),
            )
        };

        emit(UploadProgress {
            phase: "embedding".into(), current: 0, total: total_chunks,
            elapsed_secs: upload_start.elapsed().as_secs_f32(), eta_secs: 0.0,
            message: format!("准备生成 {} 个块的向量...", total_chunks),
            failed: false,
            item: None,
        });

        let mut embedding_failed = false;
        let mut error_msg: Option<String> = None;
        let chunk_embeddings: Vec<Option<Vec<f32>>> =
            if let (Some(key), Some(url)) = (api_key, base_url) {
                if total_chunks == 0 {
                    Vec::new()
                } else {
                    let texts: Vec<String> = chunks.clone();
                    let last_emit = std::sync::Arc::new(
                        std::sync::Mutex::new(std::time::Instant::now())
                    );
                    // 把 emit 本身 clone 供 emit_throttled 使用（Fn 可以 clone）
                    let emit_clone = emit.clone();
                    let emit_throttled = move |done_batches: usize, total_batches: usize, eta: f32| {
                        let mut last = last_emit.lock().unwrap();
                        let now = std::time::Instant::now();
                        if now.duration_since(*last).as_millis() >= 200
                            || done_batches == total_batches
                        {
                            *last = now;
                            let chunks_done = done_batches.saturating_mul(16).min(total_chunks);
                            emit_clone(UploadProgress {
                                phase: "embedding".into(),
                                current: chunks_done, total: total_chunks,
                                elapsed_secs: upload_start.elapsed().as_secs_f32(),
                                eta_secs: eta,
                                message: format!("正在生成向量（{}/{} 批次）", done_batches, total_batches),
                                failed: false,
                                item: None,
                            });
                        }
                    };

                    let results = knowledge::get_embeddings_concurrent(
                        texts, &key, &url, 4, 16, emit_throttled,
                    );
                    let success = results.iter().filter(|x| x.is_some()).count();
                    if success == 0 {
                        embedding_failed = true;
                        error_msg = Some("全部块向量生成失败".into());
                    } else if success < total_chunks {
                        embedding_failed = true;
                        error_msg = Some(format!("部分块向量生成失败（{}/{} 成功）", success, total_chunks));
                    }
                    println!("  Embedding 完成: 成功 {}/{} 块", success, total_chunks);
                    results
                }
            } else {
                println!("  未配置 AI，将使用关键词搜索模式");
                embedding_failed = true;
                error_msg = Some("未配置 AI，将使用关键词搜索模式".into());
                vec![None; total_chunks]
            };

        // 4. 入库
        emit(UploadProgress {
            phase: "save".into(),
            current: total_chunks, total: total_chunks,
            elapsed_secs: upload_start.elapsed().as_secs_f32(),
            eta_secs: 0.0,
            message: "正在写入数据库...".into(),
            failed: embedding_failed,
            item: None,
        });

        let item_id = Uuid::new_v4().to_string();
        let now = now_iso();

        let mut summary = if text.chars().count() > 200 {
            text.chars().take(200).collect::<String>() + "..."
        } else {
            text.clone()
        };
        if let Some(ref err) = error_msg {
            summary = format!("{}\n\n[注意：{}]", summary, err);
        }

        let mut conn = db_conn.lock().map_err(|e| format!("数据库锁定失败: {}", e))?;
        let tx = conn.transaction().map_err(|e| format!("事务启动失败: {}", e))?;

        tx.execute(
            "INSERT INTO knowledge_items (id, source, source_type, title, content, summary, file_path, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![&item_id, "local", &ext_clone, &title_clone, &text, &summary, &file_path_clone, &now],
        ).map_err(|e| format!("保存文件信息失败: {}", e))?;

        let bases: Vec<String> = match base_ids_clone {
            Some(b) if !b.is_empty() => b,
            _ => vec!["default".to_string()],
        };
        for base_id in &bases {
            tx.execute(
                "INSERT OR IGNORE INTO knowledge_item_bases (item_id, base_id) VALUES (?1, ?2)",
                rusqlite::params![&item_id, base_id],
            )
            .map_err(|e| format!("关联知识库失败: {}", e))?;
        }

        for (i, (chunk_text, emb)) in chunks
            .into_iter()
            .zip(chunk_embeddings.into_iter())
            .enumerate()
        {
            let chunk_id = Uuid::new_v4().to_string();
            let emb_json = emb.map(|e| serde_json::to_string(&e).unwrap_or_default());
            tx.execute(
                "INSERT INTO knowledge_chunks (id, item_id, chunk_index, content, embedding) VALUES (?1, ?2, ?3, ?4, ?5)",
                rusqlite::params![&chunk_id, &item_id, i, chunk_text, emb_json],
            )
            .map_err(|e| format!("保存文本块失败: {}", e))?;
        }

        tx.commit().map_err(|e| format!("提交事务失败: {}", e))?;

        let result_item = KnowledgeItem {
            id: item_id.clone(),
            source: "local".to_string(),
            source_type: ext_clone.clone(),
            title: title_clone.clone(),
            content: Some(text.clone()),
            url: None,
            tags: None,
            summary: Some(summary.clone()),
            file_path: Some(file_path_clone.clone()),
            base_ids: bases.clone(),
            created_at: now.clone(),
        };

        emit(UploadProgress {
            phase: "done".into(),
            current: total_chunks, total: total_chunks,
            elapsed_secs: upload_start.elapsed().as_secs_f32(), eta_secs: 0.0,
            message: "上传完成".into(), failed: embedding_failed,
            item: Some(result_item.clone()),
        });

        println!(
            "知识库文件处理完成: {} (耗时 {:.1}s)",
            title_clone,
            upload_start.elapsed().as_secs_f32()
        );

        Ok(result_item)
    })
    .await
    .map_err(|e| format!("处理任务失败: {}", e))??;

    Ok(result)
}
// ============================================================
// 检索
// ============================================================

/// 关键词打分
fn keyword_match_score(query: &str, content: &str) -> usize {
    let query_lower = query.to_lowercase();
    let content_lower = content.to_lowercase();
    let mut score = 0;

    if content_lower.contains(&query_lower) {
        score += 10;
    }

    let chars: Vec<char> = query_lower.chars().collect();
    if chars.len() >= 2 {
        for i in 0..chars.len() - 1 {
            let bigram: String = chars[i..i + 2].iter().collect();
            if content_lower.contains(&bigram) {
                score += 1;
            }
        }
    }

    for word in query_lower.split(|c: char| c.is_whitespace() || c.is_ascii_punctuation()) {
        let word = word.trim();
        if word.len() >= 2 && content_lower.contains(word) {
            score += 3;
        }
    }

    score
}

pub struct ChunkRow {
    pub item_title: String,
    pub content: String,
    pub embedding: Option<Vec<f32>>,
}

/// 加载知识块
/// - item_id: 取指定文件的块
/// - base_id: 取指定知识库下所有文件的块
/// - 都不传：取全部
pub fn fetch_chunks(
    conn: &Connection,
    item_id: Option<String>,
    base_id: Option<String>,
) -> Vec<ChunkRow> {
    let mut conditions = vec!["k.deleted_at IS NULL".to_string()];
    if item_id.is_some() {
        conditions.push("k.id = ?".to_string());
    }
    if base_id.is_some() {
        conditions.push("EXISTS (SELECT 1 FROM knowledge_item_bases kib WHERE kib.item_id = k.id AND kib.base_id = ?)".to_string());
    }
    let where_clause = conditions.join(" AND ");

    let sql = format!(
        "SELECT k.title, c.content, c.embedding FROM knowledge_chunks c
         JOIN knowledge_items k ON c.item_id = k.id
         WHERE {}",
        where_clause
    );

    let Ok(mut stmt) = conn.prepare(&sql) else {
        return Vec::new();
    };

    let map_row = |row: &rusqlite::Row<'_>| -> rusqlite::Result<(String, String, Option<String>)> {
        Ok((row.get(0)?, row.get(1)?, row.get(2)?))
    };

    // 动态参数（owned String，无需借用）
    let mut bound: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    if let Some(i) = item_id {
        bound.push(Box::new(i));
    }
    if let Some(b) = base_id {
        bound.push(Box::new(b));
    }

    let rows: Vec<(String, String, Option<String>)> = stmt
        .query_map(rusqlite::params_from_iter(bound.iter()), map_row)
        .map(|r| r.filter_map(|x| x.ok()).collect())
        .unwrap_or_default();

    rows.into_iter()
        .map(|(title, content, emb_str)| ChunkRow {
            item_title: title,
            content,
            embedding: emb_str.and_then(|s| serde_json::from_str::<Vec<f32>>(&s).ok()),
        })
        .collect()
}

pub fn resolve_item_id_by_hint(conn: &Connection, hint: &str) -> Option<String> {
    let hint_lower = format!("%{}%", hint.to_lowercase());
    conn.query_row(
        "SELECT id FROM knowledge_items WHERE deleted_at IS NULL AND LOWER(title) LIKE ?1 LIMIT 1",
        rusqlite::params![hint_lower],
        |row| row.get(0),
    )
    .ok()
}

/// 知识库检索（不持数据库锁）
pub fn search_knowledge(
    query: &str,
    all_chunks: &[ChunkRow],
    api_key: &str,
    base_url: &str,
) -> Result<(bool, String, Option<String>), String> {
    if all_chunks.is_empty() {
        return Ok((false, "（知识库为空，请先上传文件）".to_string(), None));
    }

    let vector_chunks: Vec<&ChunkRow> = all_chunks
        .iter()
        .filter(|c| c.embedding.is_some())
        .collect();

    if !vector_chunks.is_empty() {
        if let Ok(query_emb) = knowledge::get_embedding(query, api_key, base_url) {
            let mut scored_chunks: Vec<(f32, &ChunkRow)> = vector_chunks
                .iter()
                .map(|c| {
                    let score = knowledge::cosine_similarity(&query_emb, c.embedding.as_ref().unwrap());
                    (score, *c)
                })
                .collect();

            scored_chunks.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));

            let top_chunks: Vec<_> = scored_chunks
                .into_iter()
                .filter(|(score, _)| *score > 0.70)
                .take(4)
                .map(|(_, c)| c)
                .collect();

            if !top_chunks.is_empty() {
                let mut context_str = String::from("以下内容来自本地知识库文件：\n\n");
                let mut source_title = None;
                if let Some(first) = top_chunks.first() {
                    source_title = Some(first.item_title.clone());
                }
                for c in &top_chunks {
                    context_str.push_str(&format!("【来源：{}】\n{}\n\n", c.item_title, c.content));
                }
                return Ok((true, context_str, source_title));
            }
        }
    }

    println!("  使用关键词搜索模式");
    let mut scored_chunks: Vec<(usize, &ChunkRow)> = all_chunks
        .iter()
        .map(|c| {
            let score = keyword_match_score(query, &c.content);
            (score, c)
        })
        .filter(|(score, _)| *score > 0)
        .collect();

    scored_chunks.sort_by(|a, b| b.0.cmp(&a.0));

    let top_chunks: Vec<_> = scored_chunks
        .into_iter()
        .take(4)
        .map(|(_, c)| c)
        .collect();

    if top_chunks.is_empty() {
        return Ok((false, "在知识库中没有找到相关内容。".to_string(), None));
    }

    let mut context_str = String::from("以下内容来自本地知识库文件（关键词匹配）：\n\n");
    let mut source_title = None;
    if let Some(first) = top_chunks.first() {
        source_title = Some(first.item_title.clone());
    }
    for c in &top_chunks {
        context_str.push_str(&format!("【来源：{}】\n{}\n\n", c.item_title, c.content));
    }

    Ok((true, context_str, source_title))
}

/// 按指定文件的知识块检索（不持数据库锁）
pub fn search_knowledge_by_id(
    query: &str,
    all_chunks: &[ChunkRow],
    api_key: &str,
    base_url: &str,
) -> Result<(bool, String), String> {
    if all_chunks.is_empty() {
        return Ok((false, "该文件没有可检索的内容。".to_string()));
    }

    let vector_chunks: Vec<&ChunkRow> = all_chunks
        .iter()
        .filter(|c| c.embedding.is_some())
        .collect();

    if !vector_chunks.is_empty() {
        if let Ok(query_emb) = knowledge::get_embedding(query, api_key, base_url) {
            let mut scored_chunks: Vec<(f32, &ChunkRow)> = vector_chunks
                .iter()
                .map(|c| {
                    let score = knowledge::cosine_similarity(&query_emb, c.embedding.as_ref().unwrap());
                    (score, *c)
                })
                .collect();

            scored_chunks.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));

            let top_chunks: Vec<_> = scored_chunks
                .into_iter()
                .filter(|(score, _)| *score > 0.65)
                .take(5)
                .map(|(_, c)| c)
                .collect();

            if !top_chunks.is_empty() {
                let mut context_str = String::new();
                for c in &top_chunks {
                    context_str.push_str(&format!("{}\n\n", c.content));
                }
                return Ok((true, context_str));
            }
        }
    }

    let mut scored_chunks: Vec<(usize, &ChunkRow)> = all_chunks
        .iter()
        .map(|c| {
            let score = keyword_match_score(query, &c.content);
            (score, c)
        })
        .filter(|(score, _)| *score > 0)
        .collect();

    scored_chunks.sort_by(|a, b| b.0.cmp(&a.0));

    let top_chunks: Vec<_> = scored_chunks
        .into_iter()
        .take(5)
        .map(|(_, c)| c)
        .collect();

    if top_chunks.is_empty() {
        return Ok((false, "没有找到相关内容。".to_string()));
    }

    let mut context_str = String::new();
    for c in &top_chunks {
        context_str.push_str(&format!("{}\n\n", c.content));
    }

    Ok((true, context_str))
}

/// 查询知识库（兼容旧接口 + 支持新 base_id）
#[tauri::command]
pub async fn query_knowledge_base(
    state: State<'_, DbState>,
    query: String,
    file_hint: Option<String>,
    base_id: Option<String>,
) -> Result<String, String> {
    let (api_key, base_url) = {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        (
            get_setting_value(&conn, "ai_api_key"),
            get_setting_value(&conn, "ai_base_url"),
        )
    };

    if api_key.is_none() || base_url.is_none() {
        return Err("AI未配置，无法进行知识库检索。请先在设置中配置AI模型。".to_string());
    }

    let key = api_key.unwrap();
    let url = base_url.unwrap();

    let chunks = {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        let item_id = file_hint
            .as_deref()
            .and_then(|hint| resolve_item_id_by_hint(&conn, hint));
        fetch_chunks(&conn, item_id, base_id)
    };

    let (found, context, _) = search_knowledge(&query, &chunks, &key, &url)?;

    if !found {
        return Ok("在知识库中没有找到该问题。".to_string());
    }

    Ok(context)
}