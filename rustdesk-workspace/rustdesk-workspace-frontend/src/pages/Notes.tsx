import { useEffect, useMemo, useState, useRef } from "react";
import { api } from "../api";
import type { Note } from "../types";
import { useAppStore } from "../store";
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

  async function deleteNote(id: string) {
    if (!confirm("确定删除这条笔记吗？")) return;
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
            <h1 className="text-[18px] font-semibold">笔记</h1>
            <button
              onClick={() => setShowCreate(true)}
              className="btn btn-primary btn-icon"
              aria-label="新建"
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
              placeholder="搜索笔记..."
              className="flex-1 bg-transparent text-[13px] outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-[var(--text-tertiary)] px-4 text-center">
              <FileText size={28} className="mb-3 opacity-30" />
              <div className="text-[13px] mb-3">
                {search ? "没有匹配的笔记" : "还没有笔记"}
              </div>
              {!search && (
                <button
                  onClick={() => setShowCreate(true)}
                  className="btn btn-secondary"
                >
                  <Plus size={14} />
                  新建笔记
                </button>
              )}
            </div>
          ) : (
            filtered.map((n) => (
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
                      {n.title || "无标题"}
                    </div>
                    <div className="text-[11px] text-[var(--text-tertiary)] truncate mt-0.5">
                      {n.content.replace(/[#*`>\-\[\]]/g, "").trim().substring(0, 60) || "空笔记"}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-[var(--text-tertiary)]">
                      <span>{formatRelativeTime(n.updated_at)}</span>
                      <span>·</span>
                      <span>{n.word_count} 字</span>
                    </div>
                  </div>
                </div>
              </button>
            ))
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
                placeholder="无标题"
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
                  aria-label="置顶"
                >
                  <Pin size={14} />
                </button>
                <button
                  onClick={() => deleteNote(active.id)}
                  className="btn btn-danger btn-icon"
                  aria-label="删除"
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
                  placeholder="开始书写...支持 Markdown 与 [[双向链接]]"
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
                <span>{active.word_count} 字</span>
                <span>·</span>
                <span>{active.content.length} 字符</span>
                {parseTags(active.tags).length > 0 && (
                  <>
                    <span>·</span>
                    <span>{parseTags(active.tags).join(", ")}</span>
                  </>
                )}
              </div>
              <span>最后编辑 {formatRelativeTime(active.updated_at)}</span>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-[var(--text-tertiary)]">
            <FileText size={48} className="mb-4 opacity-20" />
            <div className="text-[14px] mb-4">选择笔记开始阅读</div>
            <button
              onClick={() => setShowCreate(true)}
              className="btn btn-primary"
            >
              <Plus size={14} />
              新建笔记
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
          元信息
        </div>
        <div className="space-y-2 text-[12px]">
          <div className="flex items-center justify-between">
            <span className="text-[var(--text-tertiary)]">创建</span>
            <span>{formatRelativeTime(note.created_at)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[var(--text-tertiary)]">修改</span>
            <span>{formatRelativeTime(note.updated_at)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[var(--text-tertiary)]">字数</span>
            <span>{note.word_count}</span>
          </div>
        </div>
      </div>

      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
          标签
        </div>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {tags.map((t) => (
            <span
              key={t}
              className="pill bg-accent-50 text-accent-500"
            >
              #{t}
              <button
                onClick={() => removeTag(t)}
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
            placeholder="添加标签..."
            className="input flex-1 h-7 text-[11px]"
          />
          <button onClick={addTag} className="btn btn-secondary btn-icon h-7">
            <Plus size={12} />
          </button>
        </div>
      </div>

      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
          提示
        </div>
        <div className="text-[11px] text-[var(--text-secondary)] leading-relaxed space-y-1.5">
          <div>• 使用 <code>[[标题]]</code> 创建双向链接</div>
          <div>• 支持 Markdown 标准语法</div>
          <div>• 代码块、表格、引用都可以</div>
          <div>• 所有内容保存在本地 SQLite</div>
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
          <h2 className="text-[14px] font-semibold">新建笔记</h2>
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
            placeholder="笔记标题..."
            className="input"
            autoFocus
          />
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
          <button onClick={onClose} className="btn btn-ghost">
            取消
          </button>
          <button onClick={create} disabled={!title.trim()} className="btn btn-primary">
            创建
          </button>
        </div>
      </div>
    </div>
  );
}