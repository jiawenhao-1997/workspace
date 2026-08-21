import { useEffect, useMemo, useState, useRef } from "react";
import { api } from "../api";
import type { Note } from "../types";
import { useAppStore } from "../store";
import { useTranslation } from "react-i18next";
import {
  Plus,
  Search,
  Pin,
  Trash2,
  FileText,
  X,
  Hash,
  Clock,
  Edit3,
  Eye,
  Link2,
} from "lucide-react";
import { cn, formatRelativeTime, parseTags } from "../utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function Notes() {
  const { t } = useTranslation();
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [mode, setMode] = useState<"edit" | "preview" | "split">("split");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 监听新建笔记弹窗
  const newNoteModalOpen = useAppStore((s) => s.newNoteModalOpen);
  const closeNewNoteModal = useAppStore((s) => s.closeNewNoteModal);

  useEffect(() => {
    if (newNoteModalOpen) {
      setShowCreate(true);
      closeNewNoteModal();
    }
  }, [newNoteModalOpen]);

  // 派生状态：当前笔记
  const active = useMemo(() => notes.find((n) => n.id === activeId) ?? null, [notes, activeId]);

  // 防抖保存
  function debouncedUpdate(content: string) {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (!active) return;
      api.updateNote({ id: active.id, content }).then(() => {
        setNotes((ns) =>
          ns.map((n) =>
            n.id === active.id
              ? { ...n, content, word_count: content.split(/\s+/).length }
              : n
          )
        );
      });
    }, 500);
  }

  // 切换笔记时更新 textarea 内容
  useEffect(() => {
    if (textareaRef.current && active) {
      textareaRef.current.value = active.content;
    }
  }, [activeId, active]);

  // Cmd+S 保存
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (textareaRef.current && active) {
          debouncedUpdate(textareaRef.current.value);
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active]);

  async function load() {
    try {
      const ns = await api.listNotes();
      setNotes(ns);
      if (!activeId && ns.length > 0) {
        setActiveId(ns[0].id);
      }
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!search) return notes;
    const q = search.toLowerCase();
    return notes.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        n.content.toLowerCase().includes(q) ||
        (n.tags ?? "").toLowerCase().includes(q)
    );
  }, [notes, search]);

  // P1-1: FTS5 全文搜索结果（含高亮片段与相关度），与上面的客户端过滤互不影响
  const [ftsResults, setFtsResults] = useState<
    Array<Note & { rank: number; snippet: string }>
  >([]);
  const [ftsLoading, setFtsLoading] = useState(false);

  useEffect(() => {
    const q = search.trim();
    if (!q) {
      setFtsResults([]);
      return;
    }
    // 防抖：用户连续输入时仅触发最后一次请求
    const timer = setTimeout(async () => {
      setFtsLoading(true);
      try {
        // FTS5 至少需 3 字符才有命中，短查询回退到普通 LIKE 搜索
        let results: Array<Note & { rank: number; snippet: string }>;
        if (q.replace(/\s/g, "").length >= 3) {
          results = await api.searchNotesFts(q, 50);
        } else {
          results = await api.searchNotes(q);
        }
        setFtsResults(results);
      } catch (e) {
        console.error("搜索失败:", e);
        setFtsResults([]);
      } finally {
        setFtsLoading(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [search]);

  const finalFiltered = useMemo(() => {
    // 有搜索关键词时优先展示 FTS5 结果（按相关度排序 + 高亮）
    if (search.trim()) return ftsResults as unknown as Note[];
    return notes;
  }, [search, ftsResults, notes]);

  async function deleteNote(id: string) {
    if (!confirm(t("notes.confirmDelete"))) return;
    try {
      await api.deleteNote(id);
      if (activeId === id) setActiveId(null);
      await load();
    } catch (e) {
      console.error(e);
    }
  }

  async function togglePin(n: Note) {
    try {
      await api.updateNote({ id: n.id, is_pinned: !n.is_pinned });
      await load();
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <div className="flex h-full">
      {/* 左：笔记列表 */}
      <div className="w-[300px] flex-shrink-0 border-r border-[var(--border)] bg-[var(--bg-primary)] flex flex-col">
        <div className="border-b border-[var(--border)] px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-[18px] font-semibold">{t("sidebar.notes")}</h1>
            <button
              onClick={() => setShowCreate(true)}
              className="btn btn-primary btn-icon"
              aria-label={t("common.new")}
            >
              <Plus size={14} />
            </button>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-1.5">
            <Search size={14} className="text-[var(--text-tertiary)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onCompositionStart={(e) => e.stopPropagation()}
              onCompositionEnd={(e) => setSearch(e.target.value)}
              placeholder={t("notes.searchPlaceholder")}
              className="flex-1 bg-transparent text-[13px] outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {ftsLoading && search.trim() ? (
            <div className="flex flex-col items-center justify-center h-full text-[var(--text-tertiary)] px-4 text-center">
              <div className="text-[12px]">{t("notes.searching")}</div>
            </div>
          ) : finalFiltered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-[var(--text-tertiary)] px-4 text-center">
              <FileText size={28} className="mb-3 opacity-30" />
              <div className="text-[13px] mb-3">
                {search ? t("notes.noResults") : t("notes.noNotes")}
              </div>
              {!search && (
                <button
                  onClick={() => setShowCreate(true)}
                  className="btn btn-secondary"
                >
                  <Plus size={14} />
                  {t("notes.newNote")}
                </button>
              )}
            </div>
          ) : (
            finalFiltered.map((n) => {
              const snippet = (n as any).snippet as string | undefined;
              return (
              <button
                key={n.id}
                onClick={() => setActiveId(n.id)}
                className={cn(
                  "w-full text-left px-3 py-2.5 rounded-lg mb-0.5 transition-colors",
                  activeId === n.id
                    ? "bg-[var(--bg-tertiary)]"
                    : "hover:bg-[var(--bg-hover)]"
                )}
              >
                <div className="flex items-start gap-2">
                  {n.is_pinned && (
                    <Pin size={11} className="text-warning mt-0.5 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium truncate">
                      {n.title || t("notes.untitled")}
                    </div>
                    <div
                      className="text-[11px] text-[var(--text-tertiary)] truncate mt-0.5"
                      // P1-1: FTS5 高亮片段（带 <mark> 标签）
                      dangerouslySetInnerHTML={
                        snippet
                          ? { __html: snippet }
                          : undefined
                      }
                    >
                      {!snippet &&
                        (n.content.replace(/[#*`>\-\[\]]/g, "").trim().substring(0, 60) || t("notes.emptyNote"))}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-[var(--text-tertiary)]">
                      <span>{formatRelativeTime(n.updated_at)}</span>
                      <span>·</span>
                      <span>{n.word_count} {t("notes.wordCount")}</span>
                    </div>
                  </div>
                </div>
              </button>
              );
            })
          )}
        </div>
      </div>

      {/* 中：编辑器 / 预览 */}
      <div className="flex-1 flex flex-col bg-[var(--bg-primary)]">
        {active ? (
          <>
            <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-3">
              <input
                value={active.title}
                onChange={(e) => {
                  if (!active) return;
                  api.updateNote({ id: active.id, title: e.target.value });
                  setNotes((ns) =>
                    ns.map((n) =>
                      n.id === active.id ? { ...n, title: e.target.value } : n
                    )
                  );
                }}
                onCompositionStart={(e) => e.stopPropagation()}
                placeholder={t("notes.untitled")}
                className="text-[18px] font-semibold bg-transparent outline-none flex-1"
              />
              <div className="flex items-center gap-1">
                <div className="flex rounded-lg border border-[var(--border)] p-0.5 mr-2">
                  {[
                    { id: "edit", icon: <Edit3 size={12} /> },
                    { id: "split", icon: <Hash size={12} /> },
                    { id: "preview", icon: <Eye size={12} /> },
                  ].map((v) => (
                    <button
                      key={v.id}
                      onClick={() => setMode(v.id as any)}
                      className={cn(
                        "rounded-md px-2 py-1 transition-colors",
                        mode === v.id
                          ? "bg-[var(--bg-tertiary)]"
                          : "text-[var(--text-secondary)]"
                      )}
                    >
                      {v.icon}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => togglePin(active)}
                  className={cn(
                    "btn btn-ghost btn-icon",
                    active.is_pinned && "text-warning"
                  )}
                  aria-label={t("notes.pin")}
                >
                  <Pin size={14} />
                </button>
                <button
                  onClick={() => deleteNote(active.id)}
                  className="btn btn-danger btn-icon"
                  aria-label={t("common.delete")}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-hidden flex">
              {mode !== "preview" && (
                <textarea
                  ref={textareaRef}
                  defaultValue={active.content}
                  onChange={(e) => debouncedUpdate(e.target.value)}
                  onCompositionStart={(e) => e.stopPropagation()}
                  onCompositionEnd={(e) => debouncedUpdate(e.target.value)}
                  placeholder={t("notes.placeholder")}
                  className={cn(
                    "flex-1 p-6 bg-transparent outline-none text-[14px] leading-[1.9] resize-none",
                    mode === "split" && "border-r border-[var(--border)]"
                  )}
                  style={{ fontFamily: "var(--font-sans)" }}
                />
              )}
              {mode !== "edit" && (
                <div className="flex-1 overflow-y-auto p-6">
                  <MarkdownPreview content={active.content} />
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-[var(--border)] px-6 py-2 text-[11px] text-[var(--text-tertiary)]">
              <div className="flex items-center gap-3">
                <span>{active.word_count} {t("notes.wordCount")}</span>
                <span>·</span>
                <span>{active.content.length} {t("notes.charCount")}</span>
                {parseTags(active.tags).length > 0 && (
                  <>
                    <span>·</span>
                    <span>{parseTags(active.tags).join(", ")}</span>
                  </>
                )}
              </div>
              <span>{t("notes.lastEdited")} {formatRelativeTime(active.updated_at)}</span>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-[var(--text-tertiary)]">
            <FileText size={48} className="mb-4 opacity-20" />
            <div className="text-[14px] mb-4">{t("notes.selectNote")}</div>
            <button
              onClick={() => setShowCreate(true)}
              className="btn btn-primary"
            >
              <Plus size={14} />
              {t("notes.newNote")}
            </button>
          </div>
        )}
      </div>

      {/* 右：元信息面板 */}
      {active && (
        <div className="w-[260px] flex-shrink-0 border-l border-[var(--border)] bg-[var(--bg-primary)] overflow-y-auto">
          <NoteSidebar note={active} onUpdate={load} />
        </div>
      )}

      {showCreate && (
        <NoteCreateModal
          onClose={() => setShowCreate(false)}
          onCreated={async (id) => {
            setShowCreate(false);
            await load();
            setActiveId(id);
          }}
        />
      )}
    </div>
  );
}

function MarkdownPreview({ content }: { content: string }) {
  // 处理 [[wikilinks]]
  const processed = useMemo(() => {
    return content.replace(/\[\[([^\]]+)\]\]/g, (_, name) => {
      return `[${name}](#wikilink:${encodeURIComponent(name)})`;
    });
  }, [content]);

  return (
    <div className="markdown-body max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node, ...props }) => {
            const href = props.href ?? "";
            if (href.startsWith("#wikilink:")) {
              const name = decodeURIComponent(href.replace("#wikilink:", ""));
              return (
                <span className="wikilink">
                  <Link2 size={10} className="inline mr-1" />
                  {name}
                </span>
              );
            }
            return <a {...props} target="_blank" rel="noopener noreferrer" />;
          },
        }}
      >
        {processed}
      </ReactMarkdown>
    </div>
  );
}

function NoteSidebar({
  note,
  onUpdate,
}: {
  note: Note;
  onUpdate: () => void;
}) {
  const { t } = useTranslation();
  const [tagInput, setTagInput] = useState("");
  const tags = parseTags(note.tags);

  async function addTag() {
    if (!tagInput.trim()) return;
    const newTags = [...tags, tagInput.trim()];
    try {
      await api.updateNote({ id: note.id, tags: newTags });
      setTagInput("");
      onUpdate();
    } catch (e) {
      console.error(e);
    }
  }

  async function removeTag(tag: string) {
    const newTags = tags.filter((t) => t !== tag);
    try {
      await api.updateNote({ id: note.id, tags: newTags });
      onUpdate();
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <div className="p-4 space-y-5">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
          {t("notes.metadata")}
        </div>
        <div className="space-y-2 text-[12px]">
          <div className="flex items-center justify-between">
            <span className="text-[var(--text-tertiary)]">{t("notes.created")}</span>
            <span>{formatRelativeTime(note.created_at)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[var(--text-tertiary)]">{t("notes.modified")}</span>
            <span>{formatRelativeTime(note.updated_at)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[var(--text-tertiary)]">{t("notes.words")}</span>
            <span>{note.word_count}</span>
          </div>
        </div>
      </div>

      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
          {t("notes.tags")}
        </div>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="pill bg-accent-50 text-accent-500"
            >
              #{tag}
              <button
                onClick={() => removeTag(tag)}
                className="ml-1 -mr-1 opacity-60 hover:opacity-100"
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-1">
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addTag();
            }}
            placeholder={t("notes.addTagsPlaceholder")}
            className="input flex-1 h-7 text-[11px]"
          />
          <button onClick={addTag} className="btn btn-secondary btn-icon h-7">
            <Plus size={12} />
          </button>
        </div>
      </div>

      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
          {t("notes.hints")}
        </div>
        <div className="text-[11px] text-[var(--text-secondary)] leading-relaxed space-y-1.5">
          <div>• {t("notes.hintWikilinks")}</div>
          <div>• {t("notes.hintMarkdown")}</div>
          <div>• {t("notes.hintCodeblocks")}</div>
          <div>• {t("notes.hintLocalStorage")}</div>
        </div>
      </div>
    </div>
  );
}

function NoteCreateModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");

  async function create() {
    if (!title.trim()) return;
    try {
      const note = await api.createNote({ title, content: "" });
      onCreated(note.id);
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center backdrop-anim"
      style={{ backgroundColor: "rgba(15, 23, 42, 0.4)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-[400px] rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-soft-lg animate-fade-in-scale">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
          <h2 className="text-[14px] font-semibold">{t("notes.newNote")}</h2>
          <button onClick={onClose} className="btn btn-ghost btn-icon">
            <X size={14} />
          </button>
        </div>
        <div className="p-5">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") create();
            }}
            placeholder={t("notes.noteTitlePlaceholder")}
            className="input"
            autoFocus
          />
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
          <button onClick={onClose} className="btn btn-ghost">
            {t("common.cancel")}
          </button>
          <button onClick={create} disabled={!title.trim()} className="btn btn-primary">
            {t("common.create")}
          </button>
        </div>
      </div>
    </div>
  );
}