import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { Note } from "../types";
import {
  Search,
  BookOpen,
  FileText,
  Hash,
} from "lucide-react";
import { cn, formatRelativeTime, parseTags } from "../utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface GraphNode {
  id: string;
  label: string;
  x: number;
  y: number;
  r: number;
}

export function Knowledge() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [active, setActive] = useState<Note | null>(null);
  const [graph, setGraph] = useState<{ nodes: GraphNode[]; edges: [string, string][] }>({
    nodes: [],
    edges: [],
  });

  async function load() {
    try {
      const ns = await api.listNotes();
      setNotes(ns);
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (notes.length === 0) return;

    // 提取所有标签
    const allTags = new Set<string>();
    notes.forEach((n) => parseTags(n.tags).forEach((t) => allTags.add(t)));

    // 提取 [[wikilinks]]
    const links = new Map<string, Set<string>>();
    notes.forEach((n) => {
      const matches = n.content.matchAll(/\[\[([^\]]+)\]\]/g);
      const set = new Set<string>();
      for (const m of matches) {
        const targetTitle = m[1].trim();
        const target = notes.find((nn) => nn.title === targetTitle);
        if (target) set.add(target.id);
      }
      if (set.size > 0) links.set(n.id, set);
    });

    // 生成图布局 - 简单圆形布局
    const radius = 130;
    const cx = 200;
    const cy = 200;
    const nodes: GraphNode[] = notes.map((n, i) => {
      const angle = (i / notes.length) * Math.PI * 2;
      return {
        id: n.id,
        label: n.title,
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
        r: 6 + Math.min(10, links.get(n.id)?.size ?? 0) * 2,
      };
    });

    const edges: [string, string][] = [];
    links.forEach((targets, source) => {
      targets.forEach((t) => edges.push([source, t]));
    });

    setGraph({ nodes, edges });
  }, [notes]);

  // 提取所有标签
  const allTags = useMemo(() => {
    const set = new Set<string>();
    notes.forEach((n) => parseTags(n.tags).forEach((t) => set.add(t)));
    return Array.from(set);
  }, [notes]);

  const filteredNotes = useMemo(() => {
    return notes.filter((n) => {
      if (activeTag && !parseTags(n.tags).includes(activeTag)) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !n.title.toLowerCase().includes(q) &&
          !n.content.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [notes, activeTag, search]);

  return (
    <div className="flex h-full">
      {/* 左：笔记列表 */}
      <div className="w-[300px] flex-shrink-0 border-r border-[var(--border)] bg-[var(--bg-primary)] flex flex-col">
        <div className="border-b border-[var(--border)] px-5 py-4">
          <h1 className="text-[18px] font-semibold mb-3 flex items-center gap-2">
            <BookOpen size={18} />
            知识库
          </h1>
          <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-1.5">
            <Search size={14} className="text-[var(--text-tertiary)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onCompositionStart={(e) => e.stopPropagation()}
              onCompositionEnd={(e) => setSearch(e.target.value)}
              placeholder="全文搜索..."
              className="flex-1 bg-transparent text-[13px] outline-none"
            />
          </div>
        </div>

        {/* 标签 */}
        {allTags.length > 0 && (
          <div className="border-b border-[var(--border)] px-4 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
              标签
            </div>
            <div className="flex flex-wrap gap-1.5">
              {allTags.map((t) => (
                <button
                  key={t}
                  onClick={() => setActiveTag(activeTag === t ? null : t)}
                  className={cn(
                    "pill",
                    activeTag === t
                      ? "bg-accent-500 text-white"
                      : "bg-accent-50 text-accent-500"
                  )}
                >
                  <Hash size={10} />
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {filteredNotes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-[var(--text-tertiary)] px-4 text-center">
              <FileText size={28} className="mb-3 opacity-30" />
              <div className="text-[13px]">没有匹配的笔记</div>
            </div>
          ) : (
            filteredNotes.map((n) => (
              <button
                key={n.id}
                onClick={() => setActive(n)}
                className={cn(
                  "w-full text-left px-3 py-2.5 rounded-lg mb-0.5 transition-colors",
                  active?.id === n.id
                    ? "bg-[var(--bg-tertiary)]"
                    : "hover:bg-[var(--bg-hover)]"
                )}
              >
                <div className="text-[13px] font-medium truncate">{n.title}</div>
                <div className="text-[11px] text-[var(--text-tertiary)] truncate mt-0.5">
                  {formatRelativeTime(n.updated_at)}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* 中：图谱 */}
      <div className="flex-1 overflow-hidden bg-[var(--bg-secondary)] relative">
        {graph.nodes.length > 0 ? (
          <KnowledgeGraph
            nodes={graph.nodes}
            edges={graph.edges}
            onNodeClick={(id) => {
              const n = notes.find((nn) => nn.id === id);
              if (n) setActive(n);
            }}
            activeId={active?.id ?? null}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-[var(--text-tertiary)]">
            <BookOpen size={48} className="mb-4 opacity-20" />
            <div className="text-[14px]">知识图谱</div>
            <div className="text-[12px] mt-2 max-w-xs text-center">
              创建笔记并使用 [[双向链接]] 即可看到你的知识网络
            </div>
          </div>
        )}
      </div>

      {/* 右：预览 */}
      {active && (
        <div className="w-[340px] flex-shrink-0 border-l border-[var(--border)] bg-[var(--bg-primary)] overflow-y-auto">
          <div className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[16px] font-semibold">{active.title}</h2>
            </div>
            <div className="text-[10px] text-[var(--text-tertiary)] mb-3 flex items-center gap-2">
              <span>{formatRelativeTime(active.updated_at)}</span>
              <span>·</span>
              <span>{active.word_count} 字</span>
            </div>
            <div className="markdown-body max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ node, ...props }) => {
                    const href = props.href ?? "";
                    if (href.startsWith("#wikilink:")) {
                      const name = decodeURIComponent(href.replace("#wikilink:", ""));
                      return <span className="wikilink">{name}</span>;
                    }
                    return <a {...props} target="_blank" rel="noopener noreferrer" />;
                  },
                }}
              >
                {active.content}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KnowledgeGraph({
  nodes,
  edges,
  onNodeClick,
  activeId,
}: {
  nodes: GraphNode[];
  edges: [string, string][];
  onNodeClick: (id: string) => void;
  activeId: string | null;
}) {
  return (
    <div className="h-full w-full relative">
      <svg width="100%" height="100%" viewBox="0 0 400 400" className="absolute inset-0">
        {edges.map(([s, t], i) => {
          const source = nodes.find((n) => n.id === s);
          const target = nodes.find((n) => n.id === t);
          if (!source || !target) return null;
          return (
            <line
              key={i}
              x1={source.x}
              y1={source.y}
              x2={target.x}
              y2={target.y}
              stroke="var(--border-strong)"
              strokeWidth={1}
              opacity={0.6}
            />
          );
        })}
        {nodes.map((n) => {
          const isActive = n.id === activeId;
          return (
            <g key={n.id} onClick={() => onNodeClick(n.id)} className="cursor-pointer">
              <circle
                cx={n.x}
                cy={n.y}
                r={n.r}
                fill={isActive ? "#3B82F6" : "#94A3B8"}
                stroke={isActive ? "#1D4ED8" : "transparent"}
                strokeWidth={2}
                className="transition-all hover:fill-accent-500"
              />
              <text
                x={n.x}
                y={n.y + n.r + 12}
                textAnchor="middle"
                fontSize={10}
                fill="var(--text-secondary)"
                className="pointer-events-none"
              >
                {n.label.length > 12 ? n.label.substring(0, 12) + "..." : n.label}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="absolute bottom-4 left-4 text-[11px] text-[var(--text-tertiary)] bg-[var(--bg-primary)] px-3 py-1.5 rounded-lg border border-[var(--border)]">
        {nodes.length} 节点 · {edges.length} 链接
      </div>
    </div>
  );
}