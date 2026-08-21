import { useEffect, useState, useMemo, useRef } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import type { KnowledgeItem, KnowledgeBase, UploadProgress } from "../types";
import {
  Upload,
  FileText,
  FileSpreadsheet,
  File,
  Trash2,
  Search,
  BookOpen,
  Database,
  Loader2,
  FileType2,
  Plus,
  FolderPlus,
  MoreHorizontal,
  X as XIcon,
  Check,
} from "lucide-react";
import { cn, formatRelativeTime } from "../utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function getFileIcon(type: string, size: number = 20) {
  const t = type.toLowerCase();
  if (t === "pdf") return <FileText size={size} className="text-red-500" />;
  if (t === "docx" || t === "doc") return <FileText size={size} className="text-blue-600" />;
  if (t === "xlsx" || t === "xls") return <FileSpreadsheet size={size} className="text-green-600" />;
  if (t === "csv") return <FileSpreadsheet size={size} className="text-emerald-600" />;
  if (t === "md") return <FileType2 size={size} className="text-purple-500" />;
  if (t === "txt") return <FileText size={size} className="text-gray-500" />;
  return <File size={size} className="text-gray-400" />;
}

function getFileTypeName(type: string) {
  const t = type.toLowerCase();
  const map: Record<string, string> = {
    pdf: "PDF",
    docx: "Word",
    doc: "Word",
    xlsx: "Excel",
    xls: "Excel",
    csv: "CSV",
    txt: "Text",
    md: "Markdown",
  };
  return map[t] || type.toUpperCase();
}

interface TableRow {
  cells: string[];
}

interface ParagraphBlock {
  type: "paragraph" | "heading" | "list" | "numbered";
  content: string;
  level?: number;
  items?: string[];
}

/** 解析 Excel 提取的 | 分隔内容为表格 */
function parseExcelContent(content: string): TableRow[] {
  const lines = content.split("\n").filter((l) => l.trim());
  return lines.map((line) => ({
    cells: line.split(" | ").map((c) => c.trim()),
  })).filter((row) => row.cells.length > 0 && row.cells.some((c) => c));
}

/** 智能分段：处理 PDF/DOCX 提取的文本 */
function smartFormatText(rawContent: string): ParagraphBlock[] {
  const content = rawContent.trim();
  if (!content) return [];

  const blocks = content.split(/\n\s*\n/);
  const result: ParagraphBlock[] = [];

  for (const block of blocks) {
    const trimmedBlock = block.trim();
    if (!trimmedBlock) continue;

    const lines = trimmedBlock.split("\n").map((l) => l.trim()).filter((l) => l);

    const isNumberedList =
      lines.every((l) => /^(\d+[\.、）\)]|[(（]\d+[)）])/.test(l)) && lines.length > 0;
    const isBulletList =
      lines.every((l) => /^[-*•·◦▪▸-]/.test(l)) && lines.length > 0;
    const isHeading =
      lines.length === 1 &&
      lines[0].length < 50 &&
      (/^第[一二三四五六七八九十百千0-9]+[章节部分篇]/.test(lines[0]) ||
        /^[一二三四五六七八九十]+[、.]/.test(lines[0]) ||
        (/^\d+(\.\d+)*\s+[^\.]/.test(lines[0]) && lines[0].length < 40));

    if (isNumberedList) {
      const items = lines.map((l) => l.replace(/^(\d+[\.、）\)]|[(（]\d+[)）])\s*/, "").trim());
      result.push({ type: "numbered", content: "", items });
    } else if (isBulletList) {
      const items = lines.map((l) => l.replace(/^[-*•·◦▪▸-]+\s*/, "").trim());
      result.push({ type: "list", content: "", items });
    } else if (isHeading) {
      result.push({ type: "heading", content: lines[0] });
    } else {
      const paragraph = lines.join("").replace(/\s+/g, " ").trim();
      if (paragraph) {
        result.push({ type: "paragraph", content: paragraph });
      }
    }
  }

  return result;
}

/** 格式化文件内容用于预览 */
function formatContent(item: KnowledgeItem): {
  type: "markdown" | "text" | "table";
  content: string;
  table?: TableRow[];
  blocks?: ParagraphBlock[];
} {
  const t = item.source_type.toLowerCase();

  if (t === "xlsx" || t === "xls" || t === "csv") {
    const table = parseExcelContent(item.content || "");
    if (table.length > 0) {
      return { type: "table", content: "", table };
    }
  }

  if (t === "md") {
    return { type: "markdown", content: item.content || "" };
  }

  const content = item.content || "";
  const hasMarkdown = /^#{1,6}\s|^\s*[-*]\s|^\s*\d+\.\s|```/.test(content);
  if (hasMarkdown) {
    return { type: "markdown", content };
  }

  const blocks = smartFormatText(content);
  return { type: "text", content, blocks };
}

const DEFAULT_ICONS = ["📁", "📚", "📊", "📝", "💼", "🔬", "🎨", "💡"];

export function Knowledge() {
  const { t } = useTranslation();
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [bases, setBases] = useState<KnowledgeBase[]>([]);
  const [activeBaseId, setActiveBaseId] = useState<string>("default");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<KnowledgeItem | null>(null);

  // Upload progress
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const unlistenRef = useRef<UnlistenFn | null>(null);
  // done event only handled once (prevent double trigger from invoke Promise and event)
  const doneHandledRef = useRef(false);

  // Library modal state
  const [baseModal, setBaseModal] = useState<
    null | { mode: "create" } | { mode: "edit"; base: KnowledgeBase }
  >(null);

  // Library menu (rename/delete)
  const [menuBaseId, setMenuBaseId] = useState<string | null>(null);

  async function loadBases() {
    try {
      const data = await api.listKnowledgeBases();
      setBases(data);
      // 默认选中 default（如果存在），否则第一个
      if (data.length > 0) {
        const def = data.find((b) => b.id === activeBaseId) || data[0];
        setActiveBaseId(def.id);
      }
    } catch (e) {
      console.error("Failed to load knowledge bases:", e);
    }
  }

  async function loadItems(baseId: string | null) {
    setLoading(true);
    try {
      const data = await api.listKnowledgeItems(baseId);
      setItems(data);
    } catch (e) {
      console.error("Failed to load knowledge items:", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBases();
    // P1-3: 监听上传进度事件（done/error 由事件触发，uploading 状态完全由事件控制）
    const setupListener = async () => {
      unlistenRef.current = await listen<UploadProgress>("upload-progress", (event) => {
        const p = event.payload;
        setProgress(p);

        // done 事件：重置 uploading 状态 + reload 数据
        // 用 ref 防止 invoke Promise 也触发一次（双重保护）
        if ((p.phase === "done" || p.phase === "error") && !doneHandledRef.current) {
          doneHandledRef.current = true;
          setUploading(false);

          if (p.phase === "done" && p.item) {
            setActive(p.item);
          }

          // reload 列表（done 阶段库已写入）
          loadItems(activeBaseId);
          loadBases();

          // 1.2s 后清除进度条
          setTimeout(() => setProgress(null), 1200);
        }
      });
    };
    setupListener();
    return () => {
      if (unlistenRef.current) unlistenRef.current();
    };
  }, [activeBaseId]);

  useEffect(() => {
    if (activeBaseId) loadItems(activeBaseId);
  }, [activeBaseId]);

  async function handleUpload() {
    if (uploading) return;
    // 每次上传重置 done 保护标记
    doneHandledRef.current = false;
    setUploading(true);
    setProgress({
      phase: "extract",
      current: 0, total: 1,
      elapsed_secs: 0, eta_secs: 0,
      message: t("knowledge.uploadingPreparing"), failed: false,
      item: null,
    });
    // fire-and-forget：结果完全由 done/error 事件接管
    api.selectAndUploadKnowledgeFile([activeBaseId]).catch((e: any) => {
      // 仅作兜底：事件优先，catch 兜底（理论上不会走到这里）
      if (!doneHandledRef.current) {
        doneHandledRef.current = true;
        setUploading(false);
        alert(t("knowledge.uploadFailed", { error: e?.message ?? String(e) }));
        setTimeout(() => setProgress(null), 2000);
      }
    });
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(t("knowledge.confirmDeleteFile"))) return;
    try {
      await api.deleteKnowledgeItem(id);
      if (active?.id === id) setActive(null);
      await loadItems(activeBaseId);
      await loadBases();
    } catch (e: any) {
      alert(t("knowledge.deleteFailed", { error: e?.message ?? String(e) }));
    }
  }

  async function handleDeleteBase(base: KnowledgeBase, e: React.MouseEvent) {
    e.stopPropagation();
    if (base.id === "default") {
      alert(t("knowledge.cannotDeleteDefault"));
      return;
    }
    if (base.item_count === 0) {
      if (!confirm(t("knowledge.confirmDeleteEmptyBase", { name: base.name }))) return;
      try {
        await api.deleteKnowledgeBase(base.id, "delete_all");
        if (activeBaseId === base.id) setActiveBaseId("default");
        await loadBases();
        await loadItems(activeBaseId);
      } catch (e: any) {
        alert(t("knowledge.deleteFailed", { error: e?.message ?? String(e) }));
      }
      return;
    }
    const choice = prompt(
      t("knowledge.deleteBaseWithItems", { name: base.name, count: base.item_count }),
      "1"
    );
    if (choice === "3" || choice === null) return;
    const action = choice === "2" ? "move_to_default" : "delete_all";
    try {
      await api.deleteKnowledgeBase(base.id, action);
      if (activeBaseId === base.id) setActiveBaseId("default");
      await loadBases();
      await loadItems(activeBaseId);
    } catch (e: any) {
      alert(t("knowledge.deleteFailed", { error: e?.message ?? String(e) }));
    }
  }

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return item.title.toLowerCase().includes(q);
    });
  }, [items, search]);

  const [ftsResults, setFtsResults] = useState<
    Array<KnowledgeItem & { rank: number; snippet: string }>
  >([]);
  const [ftsLoading, setFtsLoading] = useState(false);

  useEffect(() => {
    const q = search.trim();
    if (!q) {
      setFtsResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setFtsLoading(true);
      try {
        let results: Array<KnowledgeItem & { rank: number; snippet: string }>;
        if (q.replace(/\s/g, "").length >= 3) {
          results = await api.searchKnowledgeFts(q, 50);
        } else {
          results = await api.listKnowledgeItems();
        }
        setFtsResults(results);
      } catch (e) {
        console.error(t("knowledge.searchFailed"), e);
        setFtsResults([]);
      } finally {
        setFtsLoading(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [search]);

  const finalFiltered = useMemo(() => {
    if (search.trim()) return ftsResults as unknown as KnowledgeItem[];
    return items;
  }, [search, ftsResults, items]);

  const formattedContent = useMemo(() => {
    if (!active) return null;
    return formatContent(active);
  }, [active]);

  const contentStats = useMemo(() => {
    if (!active?.content) return null;
    const chars = active.content.length;
    const lines = active.content.split("\n").length;
    return { chars, lines };
  }, [active]);

  const activeBase = bases.find((b) => b.id === activeBaseId);

  // P1-3: 进度条数据派生
  const progressPercent = useMemo(() => {
    if (!progress) return 0;
    if (progress.total === 0) return 0;
    return Math.min(100, Math.round((progress.current / progress.total) * 100));
  }, [progress]);
  const progressEtaStr = useMemo(() => {
    if (!progress || progress.eta_secs <= 0.5) return "";
    const s = Math.round(progress.eta_secs);
    if (s < 60) return t("knowledge.etaSeconds", { seconds: s });
    const m = Math.floor(s / 60);
    const r = s % 60;
    return t("knowledge.etaMinutes", { minutes: m, seconds: r });
  }, [progress, t]);
  const progressElapsedStr = useMemo(() => {
    if (!progress) return "";
    const s = Math.round(progress.elapsed_secs);
    if (s < 60) return t("knowledge.seconds", { seconds: s });
    const m = Math.floor(s / 60);
    const r = s % 60;
    return t("knowledge.minutesSeconds", { minutes: m, seconds: r });
  }, [progress, t]);

  return (
    <div className="flex h-full bg-[var(--bg-primary)]">
      {/* P1-3: 上传进度浮层 */}
      {progress && (
        <ProgressToast
          progress={progress}
          percent={progressPercent}
          eta={progressEtaStr}
          elapsed={progressElapsedStr}
          onClose={() => setProgress(null)}
        />
      )}
      {/* 左：库列表 */}
      <div className="w-[200px] flex-shrink-0 border-r border-[var(--border)] flex flex-col">
        <div className="px-4 pt-5 pb-3">
          <h1 className="text-[15px] font-semibold flex items-center gap-2 mb-1">
            <Database size={15} className="text-accent-500" />
            {t("knowledge.title")}
          </h1>
          <p className="text-[10.5px] text-[var(--text-tertiary)] leading-relaxed">
            {t("knowledge.subtitle")}
          </p>
        </div>

        <div className="px-3 pb-2">
          <button
            onClick={() => setBaseModal({ mode: "create" })}
            className="w-full h-8 rounded-lg border border-dashed border-[var(--border-strong)] text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] flex items-center justify-center gap-1.5 transition-colors"
          >
            <FolderPlus size={12} />
            {t("knowledge.newBase")}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-1">
          {bases.map((base) => (
            <div
              key={base.id}
              className={cn(
                "group relative flex items-center gap-2 px-2.5 py-2 rounded-lg mb-0.5 cursor-pointer transition-colors",
                activeBaseId === base.id
                  ? "bg-accent-50"
                  : "hover:bg-[var(--bg-hover)]"
              )}
              onClick={() => {
                setActiveBaseId(base.id);
                setActive(null);
                setMenuBaseId(null);
              }}
            >
              <span
                className="w-7 h-7 rounded-lg flex items-center justify-center text-[16px] shrink-0 bg-[var(--bg-secondary)]"
              >
                {base.icon || "📁"}
              </span>
              <div className="flex-1 min-w-0">
                <div
                  className={cn(
                    "text-[12.5px] truncate leading-tight",
                    activeBaseId === base.id
                      ? "font-medium text-accent-700"
                      : "font-medium"
                  )}
                >
                  {base.name}
                </div>
                <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5">
                  {t("knowledge.fileCount", { count: base.item_count })}
                </div>
              </div>
              {base.id !== "default" && (
                <button
                  onClick={(e) => handleDeleteBase(base, e)}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 hover:text-red-500 rounded shrink-0"
                  title={t("knowledge.deleteBase")}
                >
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 中：文件列表 */}
      <div className="w-[280px] flex-shrink-0 border-r border-[var(--border)] flex flex-col">
        <div className="px-4 pt-5 pb-3">
          {activeBase ? (
            <div className="flex items-center gap-2.5">
              <span
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[18px] shrink-0 bg-[var(--bg-secondary)]"
              >
                {activeBase.icon || "📁"}
              </span>
              <div className="min-w-0">
                <div className="text-[15px] font-semibold truncate">
                  {activeBase.name}
                </div>
                <div className="text-[10.5px] text-[var(--text-tertiary)] mt-0.5">
                  {t("knowledge.fileCount", { count: activeBase.item_count })}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-[15px] font-semibold truncate">{t("knowledge.defaultBase")}</div>
          )}
          {activeBase?.description && (
            <p className="text-[10.5px] text-[var(--text-tertiary)] mt-2 leading-relaxed line-clamp-2">
              {activeBase.description}
            </p>
          )}
        </div>

        <div className="px-4 pb-3">
          <button
            onClick={handleUpload}
            disabled={uploading}
            className="w-full h-9 rounded-lg bg-accent-500 text-white text-[13px] font-medium flex items-center justify-center gap-1.5 hover:bg-accent-600 transition-colors disabled:opacity-60"
          >
            {uploading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                {t("knowledge.extracting")}
              </>
            ) : (
              <>
                <Upload size={14} />
                {t("knowledge.uploadFile")}
              </>
            )}
          </button>
        </div>

        <div className="px-4 pb-2">
          <div className="flex items-center gap-2 h-8 rounded-lg bg-[var(--bg-secondary)] px-3">
            <Search size={13} className="text-[var(--text-tertiary)] shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("knowledge.searchPlaceholder")}
              className="flex-1 bg-transparent text-[12px] outline-none placeholder:text-[var(--text-tertiary)]"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-1">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full text-[var(--text-tertiary)] py-10">
              <Loader2 size={20} className="animate-spin mb-2" />
              <span className="text-[12px]">{t("common.loading")}</span>
            </div>
          ) : ftsLoading && search.trim() ? (
            <div className="flex flex-col items-center justify-center h-full text-[var(--text-tertiary)] py-10">
              <Loader2 size={20} className="animate-spin mb-2" />
              <span className="text-[12px]">{t("knowledge.searching")}</span>
            </div>
          ) : finalFiltered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-[var(--text-tertiary)] px-4 text-center py-10">
              <BookOpen size={28} className="mb-2 opacity-20" />
              <span className="text-[12px]">
                {search ? t("knowledge.noMatchingFiles") : t("knowledge.emptyBase")}
              </span>
              {!search && (
                <span className="text-[11px] mt-1 opacity-70">
                  {t("knowledge.supportedFormats")}
                </span>
              )}
            </div>
          ) : (
            finalFiltered.map((item) => (
              <button
                key={item.id}
                onClick={() => setActive(item)}
                className={cn(
                  "w-full text-left px-2.5 py-2 rounded-lg mb-0.5 transition-colors group flex items-start gap-2.5",
                  active?.id === item.id
                    ? "bg-accent-50"
                    : "hover:bg-[var(--bg-hover)]"
                )}
              >
                <div className="mt-0.5 shrink-0">
                  {getFileIcon(item.source_type, 16)}
                </div>
                <div className="flex-1 min-w-0">
                  <div
                    className={cn(
                      "text-[12.5px] truncate leading-tight",
                      active?.id === item.id
                        ? "font-medium text-accent-700"
                        : "font-medium"
                    )}
                  >
                    {item.title}
                  </div>
                  <div className="text-[10.5px] text-[var(--text-tertiary)] mt-0.5 flex items-center gap-1.5">
                    <span>{getFileTypeName(item.source_type)}</span>
                    <span>·</span>
                    <span>{formatRelativeTime(item.created_at)}</span>
                  </div>
                </div>
                <button
                  onClick={(e) => handleDelete(item.id, e)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-50 hover:text-red-500 rounded shrink-0 mt-0.5"
                  title={t("common.delete")}
                >
                  <Trash2 size={11} />
                </button>
              </button>
            ))
          )}
        </div>

        <div className="border-t border-[var(--border)] px-4 py-2.5">
          <div className="text-[11px] text-[var(--text-tertiary)] flex items-center gap-1.5">
            <Database size={11} />
            {t("knowledge.totalFiles", { count: items.length })}
          </div>
        </div>
      </div>

      {/* 右：预览区域 */}
      <div className="flex-1 overflow-hidden bg-[var(--bg-secondary)] flex flex-col">
        {active ? (
          <div className="flex-1 overflow-y-auto">
            <div className="bg-[var(--bg-primary)] border-b border-[var(--border)] px-8 py-5">
              <div className="max-w-3xl mx-auto">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="mt-0.5 p-2 rounded-lg bg-[var(--bg-secondary)]">
                      {getFileIcon(active.source_type, 22)}
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-[18px] font-semibold leading-tight break-words">
                        {active.title}
                      </h2>
                      <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 mt-1.5 text-[11.5px] text-[var(--text-tertiary)]">
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-[var(--bg-secondary)] font-medium text-[var(--text-secondary)]">
                          {getFileTypeName(active.source_type)}
                        </span>
                        <span>{t("knowledge.uploadedAt")} {formatRelativeTime(active.created_at)}</span>
                        {contentStats && (
                          <>
                            <span>·</span>
                            <span>{contentStats.chars.toLocaleString()} {t("knowledge.chars")}</span>
                            <span>·</span>
                            <span>{contentStats.lines} {t("knowledge.lines")}</span>
                          </>
                        )}
                      </div>
                      {active.base_ids.length > 0 && (
                        <div className="flex items-center flex-wrap gap-1 mt-2">
                          {active.base_ids.map((bid) => {
                            const base = bases.find((b) => b.id === bid);
                            if (!base) return null;
                            return (
                              <span
                                key={bid}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] bg-[var(--bg-secondary)]"
                              >
                                <span
                                  className="text-[12px] leading-none"
                                >
                                  {base.icon || "📁"}
                                </span>
                                {base.name}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={(e) => handleDelete(active.id, e)}
                    className="shrink-0 p-2 rounded-lg hover:bg-red-50 hover:text-red-500 text-[var(--text-tertiary)] transition-colors"
                    title={t("knowledge.deleteFile")}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>

            <div className="px-8 py-6">
              <div className="max-w-3xl mx-auto">
                {active.summary && active.summary.includes("[注意：向量索引生成失败") && (
                  <div className="mb-5 p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-[12px] text-amber-800 leading-relaxed">
                    <strong>{t("knowledge.warning")}:</strong> {t("knowledge.vectorSearchUnavailable")}
                  </div>
                )}

                {formattedContent?.type === "table" && formattedContent.table && (
                  <div className="bg-white rounded-xl border border-[var(--border)] overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="w-full text-[12.5px]">
                        <tbody>
                          {formattedContent.table.map((row, rowIdx) => (
                            <tr
                              key={rowIdx}
                              className={cn(
                                rowIdx === 0 ? "bg-[var(--bg-secondary)] font-medium" : "",
                                rowIdx !== 0 && "border-t border-[var(--border)]"
                              )}
                            >
                              {row.cells.map((cell, cellIdx) => (
                                <td
                                  key={cellIdx}
                                  className={cn(
                                    "px-3 py-2 align-top",
                                    cellIdx !== 0 && "border-l border-[var(--border)]"
                                  )}
                                >
                                  {cell || (
                                    <span className="text-[var(--text-tertiary)]">-</span>
                                  )}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {formattedContent?.type === "markdown" && (
                  <div className="bg-white rounded-xl border border-[var(--border)] p-6 shadow-sm">
                    <div className="markdown-body max-w-none text-[13.5px] leading-[1.8]">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {formattedContent.content}
                      </ReactMarkdown>
                    </div>
                  </div>
                )}

                {formattedContent?.type === "text" && (
                  <div className="bg-white rounded-xl border border-[var(--border)] p-7 shadow-sm">
                    <div className="text-[13.5px] leading-[1.9] text-[var(--text-primary)]">
                      {formattedContent.blocks && formattedContent.blocks.length > 0 ? (
                        formattedContent.blocks.map((block, idx) => {
                          if (block.type === "heading") {
                            return (
                              <h3
                                key={idx}
                                className="text-[15px] font-semibold mt-6 mb-3 first:mt-0 text-[var(--text-primary)]"
                              >
                                {block.content}
                              </h3>
                            );
                          }
                          if (block.type === "numbered" && block.items) {
                            return (
                              <ol
                                key={idx}
                                className="my-4 pl-5 space-y-2 list-decimal marker:text-[var(--text-tertiary)]"
                              >
                                {block.items.map((item, iIdx) => (
                                  <li key={iIdx} className="pl-1">
                                    {item}
                                  </li>
                                ))}
                              </ol>
                            );
                          }
                          if (block.type === "list" && block.items) {
                            return (
                              <ul
                                key={idx}
                                className="my-4 pl-5 space-y-2 list-disc marker:text-accent-500"
                              >
                                {block.items.map((item, iIdx) => (
                                  <li key={iIdx} className="pl-1">
                                    {item}
                                  </li>
                                ))}
                              </ul>
                            );
                          }
                          return (
                            <p key={idx} className="mb-4 last:mb-0 text-justify">
                              {block.content}
                            </p>
                          );
                        })
                      ) : (
                        <pre className="whitespace-pre-wrap break-words font-sans m-0">
                          {formattedContent.content}
                        </pre>
                      )}
                    </div>
                  </div>
                )}

                <div className="mt-6 p-4 rounded-xl bg-accent-50/60 border border-accent-100">
                  <div className="text-[12px] text-accent-700 leading-relaxed">
                    <strong>{t("knowledge.usageTitle")}:</strong> {t("knowledge.usageHint")}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-[var(--text-tertiary)] px-8">
            <div className="w-16 h-16 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border)] flex items-center justify-center mb-4">
              <BookOpen size={28} className="opacity-30" />
            </div>
            <div className="text-[15px] font-medium text-[var(--text-secondary)]">
              {activeBase?.name ?? t("knowledge.title")}
            </div>
            <div className="text-[12px] mt-2 max-w-sm text-center leading-relaxed text-[var(--text-tertiary)]">
              {t("knowledge.emptyStateHint")}
            </div>
            <div className="mt-5 flex flex-wrap gap-2 justify-center">
              {["PDF", "Word", "Excel", "TXT", "Markdown", "CSV"].map((fmt) => (
                <span
                  key={fmt}
                  className="px-2.5 py-1 rounded-md bg-[var(--bg-primary)] border border-[var(--border)] text-[11px] font-medium text-[var(--text-secondary)]"
                >
                  {t("knowledge.format", { format: fmt })}
                </span>
              ))}
            </div>
            <button
              onClick={handleUpload}
              disabled={uploading}
              className="mt-6 h-9 px-5 rounded-lg bg-accent-500 text-white text-[13px] font-medium flex items-center gap-1.5 hover:bg-accent-600 transition-colors disabled:opacity-60"
            >
              {uploading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  {t("knowledge.extracting")}
                </>
              ) : (
                <>
                  <Upload size={14} />
                  {t("knowledge.uploadFirstFile")}
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* 库新建/编辑弹窗 */}
      {baseModal && (
        <BaseModal
          base={baseModal.mode === "edit" ? baseModal.base : null}
          onClose={() => setBaseModal(null)}
          onSaved={async () => {
            setBaseModal(null);
            await loadBases();
            await loadItems(activeBaseId);
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// 库新建/编辑弹窗
// ============================================================

function BaseModal({
  base,
  onClose,
  onSaved,
}: {
  base: KnowledgeBase | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(base?.name ?? "");
  const [description, setDescription] = useState(base?.description ?? "");
  const [icon, setIcon] = useState(base?.icon ?? DEFAULT_ICONS[0]);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (base) {
        await api.updateKnowledgeBase({
          id: base.id,
          name,
          description: description || null,
          icon,
        });
      } else {
        await api.createKnowledgeBase({
          name,
          description: description || null,
          icon,
        });
      }
      await onSaved();
    } catch (e: any) {
      alert(t("knowledge.saveFailed", { error: e?.message ?? String(e) }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center backdrop-anim"
      style={{ backgroundColor: "rgba(15, 23, 42, 0.4)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-[440px] rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-soft-lg animate-fade-in-scale">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
          <h2 className="text-[14px] font-semibold">
            {base ? t("knowledge.editBase") : t("knowledge.createBase")}
          </h2>
          <button onClick={onClose} className="btn btn-ghost btn-icon">
            <XIcon size={14} />
          </button>
        </div>

        <div className="p-5 space-y-3.5">
          <div>
            <label className="text-[11px] text-[var(--text-tertiary)]">{t("knowledge.name")}</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("knowledge.namePlaceholder")}
              className="input mt-1"
              autoFocus
            />
          </div>

          <div>
            <label className="text-[11px] text-[var(--text-tertiary)]">{t("knowledge.description")}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("knowledge.descriptionPlaceholder")}
              rows={2}
              className="input mt-1 h-auto py-2"
            />
          </div>

          <div>
            <label className="text-[11px] text-[var(--text-tertiary)]">{t("knowledge.icon")}</label>
            <div className="flex flex-wrap gap-2 mt-2">
              {DEFAULT_ICONS.map((ic) => (
                <button
                  key={ic}
                  onClick={() => setIcon(ic)}
                  className={cn(
                    "w-9 h-9 rounded-lg flex items-center justify-center text-[18px]",
                    "border border-[var(--border)] hover:bg-[var(--bg-hover)]",
                    icon === ic && "border-accent-500 bg-accent-50"
                  )}
                >
                  {ic}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
          <button onClick={onClose} className="btn btn-ghost">
            {t("common.cancel")}
          </button>
          <button
            onClick={save}
            disabled={!name.trim() || saving}
            className="btn btn-primary"
          >
            <Check size={14} />
            {saving ? t("common.saving") : t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// P1-3: 上传进度浮层
// ============================================================

function ProgressToast({
  progress,
  percent,
  eta,
  elapsed,
  onClose,
}: {
  progress: UploadProgress;
  percent: number;
  eta: string;
  elapsed: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const phaseLabel: Record<string, string> = {
    extract: t("knowledge.phaseExtract"),
    embedding: t("knowledge.phaseEmbedding"),
    save: t("knowledge.phaseSave"),
    done: t("knowledge.phaseDone"),
    error: t("knowledge.phaseError"),
  };
  const label = phaseLabel[progress.phase] ?? progress.phase;
  const isDone = progress.phase === "done";
  const isError = progress.phase === "error";

  return (
    <div className="fixed bottom-6 right-6 z-40 w-[360px] rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-soft-lg overflow-hidden animate-fade-in-up">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div className="flex items-center gap-2">
          {!isDone && !isError && (
            <Loader2 size={14} className="animate-spin text-accent-500" />
          )}
          {(isDone || isError) && progress.failed && (
            <span className="text-amber-500 text-[14px]">⚠️</span>
          )}
          {(isDone || isError) && !progress.failed && (
            <span className="text-emerald-500 text-[14px]">✓</span>
          )}
          <span className="text-[12.5px] font-medium">
            {isDone ? (progress.failed ? t("knowledge.uploadDoneWithErrors") : t("knowledge.uploadDone")) : label}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
          title={t("common.close")}
        >
          <XIcon size={13} />
        </button>
      </div>

      {/* 消息 */}
      <div className="px-4 pb-2 text-[11px] text-[var(--text-tertiary)]">
        {progress.message}
      </div>

      {/* 进度条 */}
      <div className="px-4 pb-3">
        <div className="h-1.5 rounded-full bg-[var(--bg-secondary)] overflow-hidden">
          <div
            className={cn(
              "h-full transition-all duration-200",
              progress.failed ? "bg-amber-500" : "bg-accent-500"
            )}
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-1.5 text-[10.5px] text-[var(--text-tertiary)]">
          <span>
            {progress.total > 0
              ? `${progress.current} / ${progress.total} ${t("knowledge.blocks")}`
              : t("knowledge.preparing")}{" "}
            · {percent}%
          </span>
          <span>
            {!isDone && eta ? `${eta} · ${t("knowledge.elapsed")} ${elapsed}` : `${t("knowledge.duration")} ${elapsed}`}
          </span>
        </div>
      </div>

      {progress.failed && !isDone && (
        <div className="px-4 pb-3 text-[10.5px] text-amber-700 leading-relaxed">
          {t("knowledge.partialEmbeddingFailed")}
        </div>
      )}
    </div>
  );
}