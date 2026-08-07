import { useAppStore } from "../store";
import {
  Home,
  Folder,
  CheckSquare,
  FileText,
  BookOpen,
  Calendar,
  BarChart3,
  Settings,
  Plus,
  Sparkles,
} from "lucide-react";
import { cn, getGreeting, adjustColor } from "../utils";
import type { View } from "../types";

interface NavItem {
  id: View;
  label: string;
  icon: React.ReactNode;
  shortcut: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "仪表盘", icon: <Home size={16} />, shortcut: "1" },
  { id: "projects", label: "项目", icon: <Folder size={16} />, shortcut: "2" },
  { id: "tasks", label: "任务", icon: <CheckSquare size={16} />, shortcut: "3" },
  { id: "notes", label: "笔记", icon: <FileText size={16} />, shortcut: "4" },
  { id: "knowledge", label: "知识库", icon: <BookOpen size={16} />, shortcut: "5" },
  { id: "calendar", label: "日历", icon: <Calendar size={16} />, shortcut: "6" },
  { id: "analytics", label: "分析", icon: <BarChart3 size={16} />, shortcut: "7" },
  { id: "ai", label: "AI", icon: <Sparkles size={16} />, shortcut: "" },
  { id: "settings", label: "设置", icon: <Settings size={16} />, shortcut: "8" },
];

export function Sidebar() {
  const currentView = useAppStore((s) => s.currentView);
  const setView = useAppStore((s) => s.setView);
  const setCommandPaletteOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const setAiPanelOpen = useAppStore((s) => s.setAiPanelOpen);
  const user = useAppStore((s) => s.user);

  const greeting = getGreeting();

  return (
    <aside className="flex h-full w-[260px] flex-shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-primary)]">
      {/* 用户区域 */}
      <div className="px-4 pt-5 pb-3">
        <div className="flex items-center gap-3">
          <div
            className="relative h-9 w-9 flex-shrink-0 rounded-full flex items-center justify-center text-white text-[13px] font-semibold shadow-soft"
            style={{
              background: `linear-gradient(135deg, ${user.avatarColor}, ${adjustColor(user.avatarColor, -30)})`
            }}
          >
            {user.name.charAt(0).toUpperCase()}
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-success border-2 border-[var(--bg-primary)]"></span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold text-[var(--text-primary)] truncate">
              {user.name}
            </div>
            <div className="text-[11px] text-[var(--text-tertiary)] truncate">
              {user.status}
            </div>
          </div>
        </div>
      </div>

      <div className="divider mx-3"></div>

      {/* 工作区导航 */}
      <div className="flex-1 overflow-y-auto px-3 py-2 scrollbar-none">
        <div className="px-2 pt-1 pb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
          工作区
        </div>
        <nav className="space-y-1">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              className={cn(
                "nav-item relative w-full",
                currentView === item.id && "active"
              )}
            >
              <span className="text-[var(--text-secondary)]">
                {item.icon}
              </span>
              <span className="flex-1 text-left">{item.label}</span>
              <span className="kbd opacity-0 group-hover:opacity-100">
                ⌃{item.shortcut}
              </span>
            </button>
          ))}
        </nav>
      </div>

      {/* 底部状态 */}
      <div className="border-t border-[var(--border)] px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-success animate-pulse"></div>
          <span className="text-[11px] text-[var(--text-secondary)]">{greeting}</span>
          <span className="text-[11px] text-[var(--text-tertiary)]">·</span>
          <span className="text-[11px] text-[var(--text-tertiary)]">本地模式</span>
        </div>
      </div>
    </aside>
  );
}