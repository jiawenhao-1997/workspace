import { useEffect, useRef, useState } from "react";
import { Search, Plus, Sparkles, ArrowRight } from "lucide-react";
import { useAppStore } from "../store";
import { api } from "../api";

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  action: () => void | Promise<void>;
  group: string;
}

export function CommandPalette() {
  const setOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const setView = useAppStore((s) => s.setView);
  const setAiOpen = useAppStore((s) => s.setAiPanelOpen);
  const openNewTaskModal = useAppStore((s) => s.openNewTaskModal);
  const openNewNoteModal = useAppStore((s) => s.openNewNoteModal);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function quickCapture(input: string, type: string) {
    try {
      await api.quickCapture(input, type);
      setOpen(false);
      setQuery("");
    } catch (e) {
      console.error(e);
    }
  }

  const commands: Command[] = [
    {
      id: "nav-dashboard",
      label: "前往仪表盘",
      icon: <ArrowRight size={14} />,
      group: "导航",
      action: () => {
        setView("dashboard");
        setOpen(false);
      },
    },
    {
      id: "nav-projects",
      label: "前往项目",
      icon: <ArrowRight size={14} />,
      group: "导航",
      action: () => {
        setView("projects");
        setOpen(false);
      },
    },
    {
      id: "nav-tasks",
      label: "前往任务",
      icon: <ArrowRight size={14} />,
      group: "导航",
      action: () => {
        setView("tasks");
        setOpen(false);
      },
    },
    {
      id: "nav-notes",
      label: "前往笔记",
      icon: <ArrowRight size={14} />,
      group: "导航",
      action: () => {
        setView("notes");
        setOpen(false);
      },
    },
    {
      id: "nav-knowledge",
      label: "前往知识库",
      icon: <ArrowRight size={14} />,
      group: "导航",
      action: () => {
        setView("knowledge");
        setOpen(false);
      },
    },
    {
      id: "nav-calendar",
      label: "前往日历",
      icon: <ArrowRight size={14} />,
      group: "导航",
      action: () => {
        setView("calendar");
        setOpen(false);
      },
    },
    {
      id: "nav-analytics",
      label: "前往分析",
      icon: <ArrowRight size={14} />,
      group: "导航",
      action: () => {
        setView("analytics");
        setOpen(false);
      },
    },
    {
      id: "nav-settings",
      label: "前往设置",
      icon: <ArrowRight size={14} />,
      group: "导航",
      action: () => {
        setView("settings");
        setOpen(false);
      },
    },
    {
      id: "create-task",
      label: "新建任务",
      hint: "跳转到任务页面创建",
      icon: <Plus size={14} />,
      group: "创建",
      action: () => {
        setOpen(false);
        setView("tasks");
        openNewTaskModal();
      },
    },
    {
      id: "create-note",
      label: "新建笔记",
      hint: "跳转到笔记页面创建",
      icon: <Plus size={14} />,
      group: "创建",
      action: () => {
        setOpen(false);
        setView("notes");
        openNewNoteModal();
      },
    },
    {
      id: "ai-assistant",
      label: "召唤 AI 助手",
      hint: "Ctrl+Shift+Space",
      icon: <Sparkles size={14} className="text-accent-500" />,
      group: "AI",
      action: () => {
        setAiOpen(true);
        setOpen(false);
      },
    },
    {
      id: "ai-summarize",
      label: "AI: 总结今天工作",
      icon: <Sparkles size={14} className="text-accent-500" />,
      group: "AI",
      action: async () => {
        setOpen(false);
        setAiOpen(true);
      },
    },
  ];

  // 过滤命令
  const filtered = commands.filter((c) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      c.label.toLowerCase().includes(q) ||
      c.hint?.toLowerCase().includes(q) ||
      c.group.toLowerCase().includes(q)
    );
  });

  // 分组
  const grouped: Record<string, Command[]> = {};
  filtered.forEach((c) => {
    if (!grouped[c.group]) grouped[c.group] = [];
    grouped[c.group].push(c);
  });

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const cmd = filtered[activeIdx];
      if (cmd) {
        cmd.action();
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) setOpen(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 backdrop-anim"
      style={{ backgroundColor: "rgba(15, 23, 42, 0.4)" }}
      onClick={handleBackdropClick}
    >
      <div className="command-palette">
        {/* 搜索栏 */}
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3">
          <Search size={16} className="text-[var(--text-tertiary)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIdx(0);
            }}
            onCompositionStart={(e) => e.stopPropagation()}
            onCompositionEnd={(e) => {
              setQuery(e.target.value);
              setActiveIdx(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="搜索命令、创建任务、记录想法..."
            className="flex-1 bg-transparent text-[14px] outline-none placeholder:text-[var(--text-tertiary)]"
          />
          <span className="kbd">ESC</span>
        </div>

        {/* 列表 */}
        <div className="max-h-[400px] overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-[13px] text-[var(--text-tertiary)]">
              没有匹配的命令
            </div>
          ) : (
            Object.entries(grouped).map(([group, cmds]) => (
              <div key={group} className="mb-2">
                <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                  {group}
                </div>
                {cmds.map((cmd) => {
                  const idx = filtered.indexOf(cmd);
                  return (
                    <button
                      key={cmd.id}
                      onClick={() => cmd.action()}
                      onMouseEnter={() => setActiveIdx(idx)}
                      className={`flex w-full items-center gap-3 px-4 py-2 text-left text-[13px] transition-colors ${
                        idx === activeIdx
                          ? "bg-[var(--bg-tertiary)]"
                          : "hover:bg-[var(--bg-tertiary)]"
                      }`}
                    >
                      <span className="text-[var(--text-secondary)]">
                        {cmd.icon}
                      </span>
                      <span className="flex-1 text-[var(--text-primary)]">
                        {cmd.label}
                      </span>
                      {cmd.hint && (
                        <span className="text-[11px] text-[var(--text-tertiary)]">
                          {cmd.hint}
                        </span>
                      )}
                      {idx === activeIdx && (
                        <span className="kbd">↵</span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* 底部 */}
        <div className="border-t border-[var(--border)] px-4 py-2 flex items-center justify-between text-[11px] text-[var(--text-tertiary)]">
          <span>
            <span className="kbd mr-1">↑</span>
            <span className="kbd mr-1">↓</span>
            选择
          </span>
          <span>
            <span className="kbd mr-1">↵</span>
            执行
          </span>
        </div>
      </div>
    </div>
  );
}