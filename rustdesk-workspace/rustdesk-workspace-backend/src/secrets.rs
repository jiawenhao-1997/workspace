// 敏感凭据管理：API Key 用 base64 编码存入 SQLite。
// 不使用系统钥匙串，简化部署复杂度。

use base64::{engine::general_purpose::STANDARD, Engine};

/// 需要脱敏（不进入日志、不批量查询）的设置键
pub const SENSITIVE_KEYS: [&str; 1] = ["ai_api_key"];

/// 编码：写入数据库前调用
pub fn encode(value: &str) -> String {
    STANDARD.encode(value.as_bytes())
}

/// 解码：读取后调用
pub fn decode(encoded: &str) -> Option<String> {
    STANDARD.decode(encoded).ok().and_then(|bytes| {
        String::from_utf8(bytes).ok()
    })
}

/// 是否为敏感键
pub fn is_sensitive(key: &str) -> bool {
    SENSITIVE_KEYS.contains(&key)
}

/// 迁移：无操作（已直接在 SQLite 中编码存储）
pub fn migrate_from_db(_conn: &rusqlite::Connection) {
    // 不再需要迁移，直接使用编码存储即可
}
