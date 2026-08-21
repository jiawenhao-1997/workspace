use anyhow::{Result, Context};
use serde::Deserialize;
use std::time::Duration;

#[derive(Debug, Clone, Deserialize)]
pub struct SearchResult {
    pub title: String,
    pub url: String,
    pub snippet: String,
}

/// 使用 DuckDuckGo HTML 版本进行搜索（无需 API Key）
pub fn search(query: &str, max_results: usize) -> Result<Vec<SearchResult>> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(15))
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .build()?;

    let url = format!(
        "https://html.duckduckgo.com/html/?q={}",
        urlencoding::encode(query)
    );

    let resp = client
        .get(&url)
        .send()
        .context("Failed to send search request")?;

    if !resp.status().is_success() {
        anyhow::bail!("Search request failed with status: {}", resp.status());
    }

    let html = resp.text().context("Failed to read search response")?;
    parse_ddg_html(&html, max_results)
}

/// 解析 DuckDuckGo HTML 搜索结果
fn parse_ddg_html(html: &str, max_results: usize) -> Result<Vec<SearchResult>> {
    let mut results = Vec::new();

    // DuckDuckGo HTML 结果在 class="result" 的 div 中
    // 简单的 HTML 解析（不依赖额外 crate，够用即可）
    let result_blocks: Vec<&str> = html.split(r#"class="result""#).collect();

    for block in result_blocks.iter().skip(1) {
        if results.len() >= max_results {
            break;
        }

        // 提取标题和链接：<a class="result__a" href="URL">TITLE</a>
        let title = extract_between(block, r#"class="result__a""#, ">", "<")
            .unwrap_or_default()
            .trim()
            .to_string();

        let url = extract_between(block, r#"class="result__a" href=""#, "\"", "\"")
            .or_else(|| extract_between(block, "href=\"", "&", "&"))
            .or_else(|| extract_between(block, "href=\"", "\"", "\""))
            .unwrap_or_default()
            .trim()
            .to_string();

        // DuckDuckGo 有时会用 uddg 参数重定向，尝试提取真实 URL
        let url = if url.contains("uddg=") {
            url.split("uddg=")
                .nth(1)
                .and_then(|s| s.split('&').next())
                .unwrap_or(&url)
                .to_string()
        } else {
            url
        };

        // 提取摘要：<a class="result__snippet">SNIPPET</a>
        let snippet = extract_between(block, r#"class="result__snippet""#, ">", "</a>")
            .or_else(|| extract_between(block, r#"class="result__snippet""#, ">", "</div>"))
            .unwrap_or_default()
            .replace("<b>", "")
            .replace("</b>", "")
            .trim()
            .to_string();

        if !title.is_empty() && !url.is_empty() {
            results.push(SearchResult {
                title,
                url,
                snippet,
            });
        }
    }

    // 如果 HTML 解析没拿到结果，返回空 Vec，上层 AI 会告知用户搜索失败
    Ok(results)
}

/// 简单的字符串提取：找到 after 后，取 from 到 to 之间的内容
fn extract_between<'a>(text: &'a str, after: &str, from: &str, to: &str) -> Option<&'a str> {
    let after_pos = text.find(after)?;
    let start_search = after_pos + after.len();
    let from_pos = text[start_search..].find(from)? + start_search + from.len();
    let to_pos = text[from_pos..].find(to)? + from_pos;
    Some(&text[from_pos..to_pos])
}

/// 格式化搜索结果为给 LLM 的上下文文本
pub fn format_search_results(results: &[SearchResult]) -> String {
    if results.is_empty() {
        return "（网络搜索未找到相关结果）".to_string();
    }

    let mut s = String::from("## 网络搜索结果\n\n");
    for (i, r) in results.iter().enumerate() {
        s.push_str(&format!("### {}. {}\n", i + 1, r.title));
        s.push_str(&format!("链接: {}\n", r.url));
        if !r.snippet.is_empty() {
            s.push_str(&format!("摘要: {}\n", r.snippet));
        }
        s.push('\n');
    }
    s.push_str("请基于以上搜索结果，用简洁中文回答用户问题。如果搜索结果不相关，请如实说明。");
    s
}
