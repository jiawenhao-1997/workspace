import { useEffect, useRef, useState } from "react";
import { Search, Plus, Sparkles, ArrowRight } from "lucide-react";
import { useAppStore } from "../store";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
      label: t("nav.goToDashboard"),
      icon: <ArrowRight size={14} />,
      group: t("nav.navigation"),
      action: () => {
        setView("dashboard");
        setOpen(false);
      },
    },
    {
      id: "nav-projects",
      label: t("nav.goToProjects"),
      icon: <ArrowRight size={14} />,
      group: t("nav.navigation"),
      action: () => {
        setView("projects");
        setOpen(false);
      },
    },
    {
      id: "nav-tasks",
      label: t("nav.goToTasks"),
      icon: <ArrowRight size={14} />,
      group: t("nav.navigation"),
      action: () => {
        setView("tasks");
        setOpen(false);
      },
    },
    {
      id: "nav-notes",
      label: t("nav.goToNotes"),
      icon: <ArrowRight size={14} />,
      group: t("nav.navigation"),
      action: () => {
        setView("notes");
        setOpen(false);
      },
    },
    {
      id: "nav-knowledge",
      label: t("nav.goToKnowledge"),
      icon: <ArrowRight size={14} />,
      group: t("nav.navigation"),
      action: () => {
        setView("knowledge");
        setOpen(false);
      },
    },
    {
      id: "nav-calendar",
      label: t("nav.goToCalendar"),
      icon: <ArrowRight size={14} />,
      group: t("nav.navigation"),
      action: () => {
        setView("calendar");
        setOpen(false);
      },
    },
    {
      id: "nav-analytics",
      label: t("nav.goToAnalytics"),
      icon: <ArrowRight size={14} />,
      group: t("nav.navigation"),
      action: () => {
        setView("analytics");
        setOpen(false);
      },
    },
    {
      id: "nav-settings",
      label: t("nav.goToSettings"),
      icon: <ArrowRight size={14} />,
      group: t("nav.navigation"),
      action: () => {
        setView("settings");
        setOpen(false);
      },
    },
    {
      id: "create-task",
      label: t("nav.newTask"),
      hint: t("nav.newTaskHint"),
      icon: <Plus size={14} />,
      group: t("nav.create"),
      action: () => {
        setOpen(false);
        setView("tasks");
        openNewTaskModal();
      },
    },
    {
      id: "create-note",
      label: t("nav.newNote"),
      hint: t("nav.newNoteHint"),
      icon: <Plus size={14} />,
      group: t("nav.create"),
      action: () => {
        setOpen(false);
        setView("notes");
        openNewNoteModal();
      },
    },
    {
      id: "ai-assistant",
      label: t("nav.invokeAi"),
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
      label: t("nav.aiSummarize"),
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
            placeholder={t("nav.searchPlaceholder")}
            className="flex-1 bg-transparent text-[14px] outline-none placeholder:text-[var(--text-tertiary)]"
          />
          <span className="kbd">ESC</span>
        </div>

        {/* 列表 */}
        <div className="max-h-[400px] overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-[13px] text-[var(--text-tertiary)]">
              {t("nav.noResults")}
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
            {t("nav.select")}
          </span>
          <span>
            <span className="kbd mr-1">↵</span>
            {t("nav.execute")}
          </span>
        </div>
      </div>
    </div>
  );
}