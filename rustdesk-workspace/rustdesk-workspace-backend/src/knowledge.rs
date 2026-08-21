use std::path::Path;
use std::time::Duration;
use anyhow::{Result, Context};
use calamine::{Reader, open_workbook, Xlsx, Data};
use quick_xml::Reader as XmlReader;
use quick_xml::events::Event;
use std::io::Read;
use reqwest::blocking::Client;
use serde_json::{json, Value};

/// 提取 PDF 文本
fn extract_pdf(path: &Path) -> Result<String> {
    let content = pdf_extract::extract_text(path)?;
    Ok(content)
}

/// 提取 Word (DOCX) 文本
fn extract_docx(path: &Path) -> Result<String> {
    let file = std::fs::File::open(path)?;
    let mut archive = zip::ZipArchive::new(file)?;
    let mut document = archive.by_name("word/document.xml")?;
    let mut xml = String::new();
    document.read_to_string(&mut xml)?;
    
    let mut reader = XmlReader::from_str(&xml);
    let mut buf = Vec::new();
    let mut text = String::new();
    let mut in_text = false;
    
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) if e.name().as_ref() == b"w:t" => {
                in_text = true;
            }
            Ok(Event::End(ref e)) if e.name().as_ref() == b"w:t" => {
                in_text = false;
            }
            Ok(Event::Text(e)) => {
                if in_text {
                    // quick-xml 0.37: decode() handles unescaping
                    let decoded = e.decode().unwrap_or_default();
                    text.push_str(&decoded);
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(anyhow::anyhow!("XML error: {:?}", e)),
            _ => (),
        }
        buf.clear();
    }
    Ok(text)
}

/// 提取 Excel 文本
fn extract_xlsx(path: &Path) -> Result<String> {
    let mut workbook: Xlsx<_> = open_workbook(path)?;
    let mut text = String::new();
    for sheet_name in workbook.sheet_names() {
        if let Ok(range) = workbook.worksheet_range(&sheet_name) {
            for row in range.rows() {
                let row_str: Vec<String> = row.iter().map(|c| match c {
                    Data::String(s) => s.clone(),
                    Data::Float(f) => f.to_string(),
                    Data::Int(i) => i.to_string(),
                    Data::Bool(b) => b.to_string(),
                    _ => String::new()
                }).collect();
                text.push_str(&row_str.join(" | "));
                text.push('\n');
            }
        }
    }
    Ok(text)
}

/// 统一的文本提取入口
pub fn extract_text(path: &str) -> Result<String> {
    let p = Path::new(path);
    let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    match ext.as_str() {
        "pdf" => extract_pdf(p),
        "docx" => extract_docx(p),
        "xlsx" => extract_xlsx(p),
        "txt" | "md" | "csv" => Ok(std::fs::read_to_string(p)?),
        _ => Err(anyhow::anyhow!("Unsupported file type: {}", ext)),
    }
}

/// 简单的文本分块算法
pub fn chunk_text(text: &str, chunk_size: usize, overlap: usize) -> Vec<String> {
    let chars: Vec<char> = text.chars().collect();
    let mut chunks = Vec::new();
    let mut i = 0;
    while i < chars.len() {
        let end = (i + chunk_size).min(chars.len());
        let chunk: String = chars[i..end].iter().collect();
        chunks.push(chunk);
        if end == chars.len() {
            break;
        }
        i += chunk_size - overlap;
    }
    chunks
}

/// 根据 Base URL 自动选择合适的 Embedding 模型
fn select_embedding_model(base_url: &str) -> &'static str {
    let url_lower = base_url.to_lowercase();
    if url_lower.contains("volces.com") || url_lower.contains("doubao") || url_lower.contains("ark.cn-beijing") {
        // 火山引擎/豆包 - 使用通用 embedding 模型（需要用户在方舟开通）
        // 注意：豆包免费版可能不支持 embedding，会在错误中提示
        "doubao-embedding-text-240715"
    } else if url_lower.contains("dashscope.aliyuncs.com") || url_lower.contains("qwen") || url_lower.contains("aliyuncs") {
        // 通义千问
        "text-embedding-v3"
    } else if url_lower.contains("bigmodel.cn") || url_lower.contains("zhipu") || url_lower.contains("glm") {
        // 智谱AI
        "embedding-3"
    } else if url_lower.contains("deepseek.com") {
        // DeepSeek 目前没有专门的 embedding API，回退到 OpenAI 兼容模型
        // 实际 DeepSeek 不支持 embedding，需要在错误中提示
        "text-embedding-ada-002"
    } else if url_lower.contains("anthropic.com") || url_lower.contains("claude") {
        // Claude 没有 embedding API，使用 OpenAI 兼容
        "text-embedding-ada-002"
    } else {
        // OpenAI 兼容（默认）
        "text-embedding-ada-002"
    }
}

/// 获取 Embedding
pub fn get_embedding(text: &str, api_key: &str, base_url: &str) -> Result<Vec<f32>> {
    let client = Client::builder()
        .timeout(Duration::from_secs(30))
        .build()?;
    let url_base = base_url.trim_end_matches('/');
    // 识别已经包含版本路径的URL: /v1, /v2, /v3, /v4, /compatible-mode/
    let url = if url_base.ends_with("/v1") || url_base.ends_with("/v2") || url_base.ends_with("/v3") || url_base.ends_with("/v4") || url_base.contains("/compatible-mode/") {
        url_base.to_string()
    } else {
        format!("{}/v1", url_base)
    };
    let url = format!("{}/embeddings", url);

    // 自动选择 embedding 模型
    let model = select_embedding_model(base_url);
    println!("  使用 Embedding 模型: {}", model);

    let body = json!({
        "input": text,
        "model": model
    });

    let resp = client.post(&url)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&body)
        .send()?;

    let status = resp.status();
    let resp_text = resp.text()?;

    if !status.is_success() {
        // 打印错误概要方便调试（截断响应体，避免泄漏大段服务端内容）
        eprintln!("Embedding API 请求失败: HTTP {}", status);
        eprintln!("URL: {}", url);
        eprintln!(
            "响应内容: {}",
            resp_text.chars().take(200).collect::<String>()
        );

        // 给出友好的错误提示
        let provider_hint = if url.contains("volces.com") || url.contains("doubao") {
            "豆包/火山引擎：请确认你已在方舟控制台开通了向量模型（doubao-embedding），并且该模型已部署到你的接入点。免费额度可能不包含向量模型。"
        } else if url.contains("bigmodel.cn") || url.contains("zhipu") {
            "智谱AI：请确认你使用的是正确的API Key，并且账户已开通Embedding服务（embedding-3）。"
        } else if url.contains("deepseek.com") {
            "DeepSeek 目前不提供 Embedding API，请使用其他支持向量的模型（如 智谱AI、通义千问）。"
        } else if url.contains("anthropic.com") {
            "Claude/Anthropic 不提供 Embedding API，请使用其他支持向量的模型。"
        } else if url.contains("dashscope.aliyuncs.com") {
            "通义千问：请确认你已开通向量模型服务（text-embedding-v3）。"
        } else {
            "请确认你的 API 提供商支持 OpenAI 兼容的 /embeddings 接口，并且模型名称正确。"
        };

        return Err(anyhow::anyhow!(
            "HTTP {} - {}\n提示：{}",
            status.as_u16(),
            if resp_text.len() > 200 { &resp_text[..200] } else { &resp_text },
            provider_hint
        ));
    }

    let json: Value = serde_json::from_str(&resp_text)?;
    let embedding = json["data"][0]["embedding"].as_array()
        .context(format!("Invalid embedding response: {}", if resp_text.len() > 200 { &resp_text[..200] } else { &resp_text }))?
        .iter()
        .filter_map(|v| v.as_f64().map(|f| f as f32))
        .collect();

    Ok(embedding)
}

/// 计算余弦相似度
pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() { return 0.0; }
    let dot: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm_a == 0.0 || norm_b == 0.0 { return 0.0; }
    dot / (norm_a * norm_b)
}

// ============================================================
// P1-3: Embedding 批量 + 并发生成
// ============================================================

/// 批量调用 /embeddings：一次请求多个 input
/// 返回 Vec<Vec<f32>>，顺序与输入对齐（失败的填默认向量）
pub fn get_embeddings_batch(
    texts: Vec<String>,
    api_key: &str,
    base_url: &str,
) -> Result<Vec<Vec<f32>>> {
    if texts.is_empty() {
        return Ok(Vec::new());
    }
    let client = Client::builder()
        .timeout(Duration::from_secs(120))
        .build()?;
    let url_base = base_url.trim_end_matches('/');
    let url = if url_base.ends_with("/v1") || url_base.ends_with("/v2") || url_base.ends_with("/v3") || url_base.ends_with("/v4") || url_base.contains("/compatible-mode/") {
        url_base.to_string()
    } else {
        format!("{}/v1", url_base)
    };
    let url = format!("{}/embeddings", url);

    let model = select_embedding_model(base_url);

    let body = json!({
        "input": texts,
        "model": model
    });

    let resp = client.post(&url)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&body)
        .send()?;

    let status = resp.status();
    let resp_text = resp.text()?;

    if !status.is_success() {
        // 单个 input 也失败 → 直接报错（让上层走 fallback 路径）
        if texts.len() == 1 {
            return Err(anyhow::anyhow!(
                "Embedding failed: HTTP {} - {}",
                status.as_u16(),
                resp_text.chars().take(150).collect::<String>()
            ));
        }
        // 多个 input 失败 → 回退到逐条单 chunk 调用
        eprintln!(
            "[embedding] batch(size={}) failed (HTTP {}), fallback to single mode",
            texts.len(),
            status.as_u16()
        );
        let mut out = Vec::with_capacity(texts.len());
        for t in &texts {
            match get_embedding(t, api_key, base_url) {
                Ok(emb) => out.push(Some(emb)),
                Err(_) => out.push(None),
            }
        }
        // 至少 1 个成功才算 ok
        if out.iter().any(|o| o.is_some()) {
            return Ok(out.into_iter().map(|o| o.unwrap_or_default()).collect());
        }
        return Err(anyhow::anyhow!(
            "All embedding fallbacks failed (HTTP {})",
            status.as_u16()
        ));
    }

    let parsed: Value = serde_json::from_str(&resp_text)?;
    let mut results: Vec<Option<Vec<f32>>> = vec![None; texts.len()];

    if let Some(arr) = parsed["data"].as_array() {
        for (i, item) in arr.iter().enumerate() {
            if let Some(emb) = item["embedding"].as_array() {
                let v: Vec<f32> = emb.iter()
                    .filter_map(|x| x.as_f64().map(|f| f as f32))
                    .collect();
                if i < results.len() {
                    results[i] = Some(v);
                }
            }
        }
    } else if let Some(arr) = parsed.as_array() {
        for (i, item) in arr.iter().enumerate() {
            if let Some(emb) = item.as_array() {
                let v: Vec<f32> = emb.iter()
                    .filter_map(|x| x.as_f64().map(|f| f as f32))
                    .collect();
                if i < results.len() {
                    results[i] = Some(v);
                }
            }
        }
    } else {
        return Err(anyhow::anyhow!(
            "Invalid batch embedding response: {}",
            resp_text.chars().take(200).collect::<String>()
        ));
    }

    if results.iter().all(|x| x.is_none()) {
        return Err(anyhow::anyhow!(
            "Batch embedding returned no embeddings: {}",
            resp_text.chars().take(200).collect::<String>()
        ));
    }

    Ok(results.into_iter().map(|o| o.unwrap_or_default()).collect())
}

/// 调度器：分批 + 并发 + 进度回调
///
/// `inputs`: 全部 chunks 文本
/// `workers`: 并发请求数（默认 4）
/// `batch_size`: 单批内 input 数（默认 16）
/// `progress_cb`: 每完成 1 个 batch 调用 `(已完成_batches, 总batches, 预估剩余秒数)`
///
/// 返回与 inputs 对齐的 Vec<Option<Vec<f32>>>；None = 该 chunk 失败
pub fn get_embeddings_concurrent<F>(
    inputs: Vec<String>,
    api_key: &str,
    base_url: &str,
    workers: usize,
    batch_size: usize,
    progress_cb: F,
) -> Vec<Option<Vec<f32>>>
where
    F: Fn(usize, usize, f32) + Send + 'static,
{
    let total_inputs = inputs.len();
    if total_inputs == 0 {
        return Vec::new();
    }
    let workers = workers.max(1).min(8);
    let batch_size = batch_size.max(1).min(64);

    // 分批：以 chunks 切片得到若干批次，记录每个批次的「全局起始 idx」
    let batches: Vec<(usize, usize, Vec<String>)> = {
        let mut v = Vec::new();
        let mut start = 0usize;
        for chunk in inputs.chunks(batch_size) {
            v.push((v.len(), start, chunk.to_vec()));
            start += batch_size;
        }
        v
    };
    let total_batches = batches.len();

    // 每 batch 的全局起始 idx（用于反推回原数组）
    // 上面的 start 累加已经记录了，batches[i].1 即第 i 个批次的全局起始
    let batch_starts: Vec<usize> = batches.iter().map(|(_, s, _)| *s).collect();

    // 结果共享区
    let results: Vec<std::sync::Mutex<Option<Vec<f32>>>> = (0..total_inputs)
        .map(|_| std::sync::Mutex::new(None))
        .collect();
    let results_arc = std::sync::Arc::new(results);

    let completed = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let start_ts = std::time::Instant::now();
    let total_batches_arc = std::sync::Arc::new(total_batches);

    // 进度回调包装：单线程消费 channel，避免 F 多次移动
    let (ptx, prx) = std::sync::mpsc::channel::<(usize, f32)>();
    let progress_cb_opt = std::sync::Arc::new(std::sync::Mutex::new(Some(progress_cb)));
    // 关键：为每个 worker 预克隆 sender 后立即丢弃原始 sender。
    // 否则原始 sender 要存活到函数返回，而函数返回又依赖 prx.recv() 收到关闭信号，
    // prx 关闭又依赖所有 sender 被丢弃 —— 互等死锁，上传永远卡在 embedding 100%。
    let ptx_arc = std::sync::Arc::new(ptx);
    let worker_ptxs: Vec<std::sync::Arc<std::sync::mpsc::Sender<(usize, f32)>>> =
        (0..workers).map(|_| std::sync::Arc::clone(&ptx_arc)).collect();
    drop(ptx_arc);

    // 通道分发 batch
    let (tx, rx) = std::sync::mpsc::channel::<(usize, Vec<String>)>();
    let rx_arc = std::sync::Arc::new(std::sync::Mutex::new(rx));

    std::thread::scope(|s| {
        // 启动 N 个 worker（每个持有唯一的 sender 克隆）
        for ptx in worker_ptxs {
            let rx = std::sync::Arc::clone(&rx_arc);
            let results = std::sync::Arc::clone(&results_arc);
            let completed = std::sync::Arc::clone(&completed);
            let total_batches_local = *total_batches_arc;
            let batch_starts = batch_starts.clone();
            let api_key = api_key.to_string();
            let base_url = base_url.to_string();
            s.spawn(move || loop {
                let recv = {
                    let lock = rx.lock().unwrap();
                    lock.recv()
                };
                let Ok((batch_idx, batch_inputs)) = recv else {
                    break;
                };

                let start_idx = batch_starts[batch_idx];
                let res = get_embeddings_batch(batch_inputs.clone(), &api_key, &base_url);

                match res {
                    Ok(embs) => {
                        for (i, emb) in embs.into_iter().enumerate() {
                            let global_idx = start_idx + i;
                            if global_idx < results.len() {
                                if let Ok(mut g) = results[global_idx].lock() {
                                    *g = Some(emb);
                                }
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("[embedding] batch #{} failed: {}", batch_idx, e);
                        for (i, t) in batch_inputs.iter().enumerate() {
                            let global_idx = start_idx + i;
                            if global_idx >= results.len() {
                                continue;
                            }
                            if let Ok(emb) = get_embedding(t, &api_key, &base_url) {
                                if let Ok(mut g) = results[global_idx].lock() {
                                    *g = Some(emb);
                                }
                            }
                        }
                    }
                }

                let done = completed.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
                let elapsed = start_ts.elapsed().as_secs_f32();
                let eta = if done > 0 && done < total_batches_local {
                    let avg = elapsed / done as f32;
                    let remaining = (total_batches_local - done) as f32;
                    avg * remaining
                } else {
                    0.0
                };
                let _ = ptx.send((done, eta));
            });
        }

        // 派发批次
        for (_, idx, batch) in batches.into_iter() {
            tx.send((idx, batch)).unwrap();
        }
        drop(tx);

        // 消费所有进度
        if let Some(cb) = progress_cb_opt.lock().unwrap().take() {
            let total_batches_val = *total_batches_arc;
            while let Ok((done, eta)) = prx.recv() {
                cb(done, total_batches_val, eta);
            }
        }
    });

    results_arc.iter().map(|m| m.lock().unwrap().clone()).collect()
}
