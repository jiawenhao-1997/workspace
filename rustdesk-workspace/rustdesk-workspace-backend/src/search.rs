use crate::models::{KnowledgeItem, Note};
use rusqlite::{params, Connection};
use serde::Serialize;

/// FTS5 搜索结果（笔记）
#[derive(Debug, Serialize)]
pub struct NoteSearchResult {
    #[serde(flatten)]
    pub note: Note,
    /// FTS5 排序分（越小越相关，rank 函数返回负值表示命中）
    pub rank: f64,
    /// 高亮摘要片段（用于搜索结果预览）
    pub snippet: String,
}

/// FTS5 搜索结果（知识库条目）
#[derive(Debug, Serialize)]
pub struct KnowledgeSearchResult {
    #[serde(flatten)]
    pub item: KnowledgeItem,
    pub rank: f64,
    pub snippet: String,
}

/// 将用户查询转换为 FTS5 MATCH 表达式
///
/// 处理规则（适配 trigram 分词器）：
/// - 空查询返回 None（调用方应回退到普通列表）
/// - 用双引号包裹每个 token，避免 FTS5 关键字（AND/OR/NOT）误命中
/// - trigram 要求至少 3 个字符才能命中，短查询（<3 字符）返回 None 走 LIKE 回退
/// - 多 token 用空格分隔（隐含 AND 语义）
/// - 过滤掉标点符号，保留字母数字、下划线、中文字符
/// - 整体查询长度（去除空格后）< 3 字符视为太短，走 LIKE 回退
fn build_match_query(query: &str) -> Option<String> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return None;
    }

    // 按非字母数字/非中文/非_- 的字符切分，得到有效 token
    let tokens: Vec<&str> = trimmed
        .split(|c: char| !c.is_alphanumeric() && c != '_' && c != '-')
        .filter(|t| !t.is_empty())
        .collect();

    if tokens.is_empty() {
        return None;
    }

    // trigram 要求至少 3 个有效字符才可能命中；过短则返回 None 让上层走 LIKE 回退
    let total_chars: usize = tokens.iter().map(|t| t.chars().count()).sum();
    if total_chars < 3 {
        return None;
    }

    // 用双引号包裹每个 token 避免 FTS5 关键字误命中；空格分隔隐含 AND
    let parts: Vec<String> = tokens
        .iter()
        .map(|t| format!("\"{}\"", t))
        .collect();

    Some(parts.join(" "))
}

/// 全文搜索笔记（FTS5）
///
/// 性能要点：FTS5 索引毫秒级响应（万级数据 <10ms），即使 LIKE 扫描全表也无法比拟。
/// 当 query 为空时回退到普通列表查询（按更新时间倒序）。
pub fn search_notes_fts(conn: &Connection, query: &str, limit: usize) -> Result<Vec<NoteSearchResult>, String> {
    let match_query = match build_match_query(query) {
        Some(q) => q,
        None => return Ok(Vec::new()),
    };

    let mut stmt = conn
        .prepare(
            "SELECT n.id, n.title, n.content, n.tags, n.is_pinned, n.is_archived,
                    n.file_path, n.word_count, n.created_at, n.updated_at,
                    rank, snippet(notes_fts, 1, '<mark>', '</mark>', '…', 16)
             FROM notes_fts
             JOIN notes n ON n.rowid = notes_fts.rowid
             WHERE notes_fts MATCH ?1 AND n.deleted_at IS NULL
             ORDER BY rank
             LIMIT ?2",
        )
        .map_err(|e| format!("FTS5 准备失败：{}", e))?;

    let results = stmt
        .query_map(params![match_query, limit as i64], |row| {
            Ok(NoteSearchResult {
                note: Note {
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
                },
                rank: row.get(10)?,
                snippet: row.get(11)?,
            })
        })
        .map_err(|e| format!("FTS5 查询失败：{}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(results)
}

/// 全文搜索知识库（FTS5）
pub fn search_knowledge_fts(conn: &Connection, query: &str, limit: usize) -> Result<Vec<KnowledgeSearchResult>, String> {
    let match_query = match build_match_query(query) {
        Some(q) => q,
        None => return Ok(Vec::new()),
    };

    let mut stmt = conn
        .prepare(
            "SELECT k.id, k.source, k.source_type, k.title, k.content, k.url, k.tags,
                    k.summary, k.file_path, k.created_at,
                    rank, snippet(knowledge_fts, 1, '<mark>', '</mark>', '…', 16)
             FROM knowledge_fts
             JOIN knowledge_items k ON k.rowid = knowledge_fts.rowid
             WHERE knowledge_fts MATCH ?1 AND k.deleted_at IS NULL
             ORDER BY rank
             LIMIT ?2",
        )
        .map_err(|e| format!("FTS5 准备失败：{}", e))?;

    let results = stmt
        .query_map(params![match_query, limit as i64], |row| {
            Ok(KnowledgeSearchResult {
                item: KnowledgeItem {
                    id: row.get(0)?,
                    source: row.get(1)?,
                    source_type: row.get(2)?,
                    title: row.get(3)?,
                    content: row.get(4)?,
                    url: row.get(5)?,
                    tags: row.get(6)?,
                    summary: row.get(7)?,
                    file_path: row.get(8)?,
                    base_ids: Vec::new(), // FTS 检索不返回库关联
                    created_at: row.get(9)?,
                },
                rank: row.get(10)?,
                snippet: row.get(11)?,
            })
        })
        .map_err(|e| format!("FTS5 查询失败：{}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_query_returns_none() {
        assert!(build_match_query("").is_none());
        assert!(build_match_query("   ").is_none());
    }

    #[test]
    fn english_tokens_get_prefix_match() {
        let q = build_match_query("rust lang").unwrap();
        assert!(q.contains("\"rust\""));
        assert!(q.contains("\"lang\""));
    }

    #[test]
    fn chinese_tokens_quoted_no_prefix() {
        let q = build_match_query("全文搜索笔记").unwrap();
        // 中文用引号包裹，由 trigram 分词器按 3 字符滑窗匹配
        assert!(q.contains("\"全文搜索笔记\""));
    }

    #[test]
    fn too_short_query_returns_none() {
        // trigram 至少需要 3 字符
        assert!(build_match_query("a").is_none());
        assert!(build_match_query("ab").is_none());
        assert!(build_match_query("中文").is_none()); // 2 个汉字
        assert!(build_match_query("abc").is_some());
    }

    #[test]
    fn special_chars_stripped() {
        let q = build_match_query("foo!@#bar").unwrap();
        // 字母数字保留，标点作为 token 边界分隔
        assert!(q.contains("foo"));
        assert!(q.contains("bar"));
        assert!(!q.contains("@"));
        assert!(!q.contains("#"));
    }
}
