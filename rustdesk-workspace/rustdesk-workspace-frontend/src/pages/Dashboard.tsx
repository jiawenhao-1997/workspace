import { useEffect, useState } from "react";
import { api } from "../api";
import type { DashboardData } from "../types";
import {
  getGreeting,
  getFullDate,
  formatRelativeTime,
  isOverdue,
  isToday,
  cn,
} from "../utils";
import {
  Sparkles,
  ArrowRight,
  Plus,
  Circle,
  CheckCircle2,
  Flag,
  Activity as ActivityIcon,
  Clock,
  Folder,
} from "lucide-react";
import { useAppStore } from "../store";

const priorityColors: Record<string, string> = {
  urgent: "text-danger",
  high: "text-warning",
  medium: "text-accent-500",
  low: "text-[var(--text-tertiary)]",
};

const priorityBg: Record<string, string> = {
  urgent: "bg-red-50",
  high: "bg-amber-50",
  medium: "bg-blue-50",
  low: "bg-gray-50",
};

const priorityLabel: Record<string, string> = {
  urgent: "紧急",
  high: "高",
  medium: "中",
  low: "低",
};

const statusLabel: Record<string, string> = {
  todo: "待办",
  in_progress: "进行中",
  done: "已完成",
  cancelled: "已取消",
};

const activityIcons: Record<string, React.ReactNode> = {
  task_created: <Plus size={12} />,
  task_completed: <CheckCircle2 size={12} />,
  note_created: <Plus size={12} />,
  project_created: <Folder size={12} />,
  project_updated: <Folder size={12} />,
};

export function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const setView = useAppStore((s) => s.setView);
  const setCommandPaletteOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const setAiOpen = useAppStore((s) => s.setAiPanelOpen);
  const user = useAppStore((s) => s.user);

  async function load() {
    try {
      const d = await api.getDashboard();
      setData(d);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleTask(id: string) {
    try {
      await api.toggleTask(id);
      await load();
    } catch (e) {
      console.error(e);
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-[13px] text-[var(--text-tertiary)]">加载中...</div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1200px] px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-baseline justify-between">
            <div>
              <h1 className="h-display mb-1">{getGreeting()}, {user.name}</h1>
              <p className="text-[13px] text-[var(--text-secondary)]">
                {getFullDate()}
              </p>
            </div>
            <button
              onClick={() => setAiOpen(true)}
              className="btn btn-primary"
            >
              <Sparkles size={14} />
              AI 助手
            </button>
          </div>

          {/* 进度 */}
          {data && (
            <div className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                    今日完成进度
                  </div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-[28px] font-semibold text-[var(--text-primary)]">
                      {data.today_progress}%
                    </span>
                    <span className="text-[12px] text-[var(--text-tertiary)]">
                      {data.total_completed} / {data.total_completed + data.total_pending} 任务
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-[var(--text-tertiary)]">完成</div>
                  <div className="text-[20px] font-semibold text-success">
                    {data.total_completed}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-[var(--text-tertiary)]">待办</div>
                  <div className="text-[20px] font-semibold text-[var(--text-secondary)]">
                    {data.total_pending}
                  </div>
                </div>
              </div>
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${data.today_progress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* 三栏内容 */}
        <div className="grid grid-cols-3 gap-6">
          {/* 今日任务 */}
          <div className="col-span-2 space-y-6">
            <section className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="h-section">今日任务</h2>
                <button
                  onClick={() => setView("tasks")}
                  className="text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  查看全部 →
                </button>
              </div>
              {data && data.today_tasks.length > 0 ? (
                <div className="space-y-1">
                  {data.today_tasks.slice(0, 6).map((t) => (
                    <div
                      key={t.id}
                      className="task-item group"
                    >
                      <button
                        onClick={() => toggleTask(t.id)}
                        className={cn(
                          "task-checkbox",
                          t.status === "done" && "checked"
                        )}
                      >
                        {t.status === "done" && (
                          <CheckCircle2 size={12} className="text-white" />
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div
                          className={cn(
                            "text-[13px] truncate",
                            t.status === "done" &&
                              "line-through text-[var(--text-tertiary)]"
                          )}
                        >
                          {t.title}
                        </div>
                        {t.due_date && (
                          <div
                            className={cn(
                              "text-[11px] mt-0.5",
                              isOverdue(t.due_date) && t.status !== "done"
                                ? "text-danger"
                                : isToday(t.due_date)
                                ? "text-accent-500"
                                : "text-[var(--text-tertiary)]"
                            )}
                          >
                            <Clock size={10} className="inline mr-1" />
                            {t.due_date}
                            {isToday(t.due_date) && " · 今天"}
                            {isOverdue(t.due_date) &&
                              t.status !== "done" &&
                              " · 已过期"}
                          </div>
                        )}
                      </div>
                      <span
                        className={cn(
                          "pill",
                          priorityBg[t.priority],
                          priorityColors[t.priority]
                        )}
                      >
                        <Flag size={10} />
                        {priorityLabel[t.priority]}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-[13px] text-[var(--text-tertiary)]">
                  暂无任务，享受片刻宁静 ✨
                </div>
              )}
            </section>

            {/* 项目状态 */}
            <section className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="h-section">项目状态</h2>
                <button
                  onClick={() => setView("projects")}
                  className="text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  查看全部 →
                </button>
              </div>
              {data && data.active_projects.length > 0 ? (
                <div className="grid grid-cols-2 gap-3">
                  {data.active_projects.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => setView("projects")}
                      className="group cursor-pointer rounded-xl border border-[var(--border)] p-4 hover:border-[var(--border-strong)] transition-all"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            className="h-2 w-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: p.color }}
                          />
                          <div className="text-[13px] font-semibold truncate">
                            {p.name}
                          </div>
                        </div>
                        <ArrowRight
                          size={12}
                          className="text-[var(--text-tertiary)] opacity-0 group-hover:opacity-100 transition-opacity"
                        />
                      </div>
                      {p.description && (
                        <div className="text-[11px] text-[var(--text-tertiary)] line-clamp-1 mb-3">
                          {p.description}
                        </div>
                      )}
                      <div className="flex items-center justify-between text-[11px] text-[var(--text-tertiary)] mb-1.5">
                        <span>进度</span>
                        <span className="font-medium text-[var(--text-primary)]">
                          {p.progress}%
                        </span>
                      </div>
                      <div className="progress-bar">
                        <div
                          className="progress-fill"
                          style={{
                            width: `${p.progress}%`,
                            backgroundColor: p.color,
                          }}
                        />
                      </div>
                      <div className="mt-2 text-[10px] text-[var(--text-tertiary)]">
                        {p.owner && `负责人: ${p.owner}`}
                        {p.owner && p.target_date && " · "}
                        {p.target_date && `截止: ${p.target_date}`}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  onClick={() => {
                    setView("projects");
                    setCommandPaletteOpen(true);
                  }}
                  className="py-8 text-center text-[13px] text-[var(--text-tertiary)] cursor-pointer hover:text-[var(--text-primary)]"
                >
                  + 新建项目
                </div>
              )}
            </section>
          </div>

          {/* 右侧栏 */}
          <div className="space-y-6">
            {/* 快速记录 */}
            <section className="card p-4">
              <h3 className="h-section mb-3">快速记录</h3>
              <button
                onClick={() => setCommandPaletteOpen(true)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-[12px] text-[var(--text-tertiary)] hover:border-[var(--border-strong)] transition-colors"
              >
                <Sparkles size={12} />
                <span className="flex-1 text-left">记录想法、创建任务...</span>
                <span className="kbd">⌘K</span>
              </button>
            </section>

            {/* 最近活动 */}
            <section className="card p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="h-section flex items-center gap-2">
                  <ActivityIcon size={14} />
                  最近活动
                </h3>
              </div>
              {data && data.recent_activities.length > 0 ? (
                <div className="space-y-3">
                  {data.recent_activities.slice(0, 10).map((a) => (
                    <div key={a.id} className="flex items-start gap-2.5">
                      <div className="mt-0.5 h-5 w-5 flex items-center justify-center rounded-md bg-[var(--bg-tertiary)] text-[var(--text-secondary)] flex-shrink-0">
                        {activityIcons[a.type] ?? <Circle size={10} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] text-[var(--text-primary)] truncate">
                          {a.title}
                        </div>
                        <div className="text-[10px] text-[var(--text-tertiary)]">
                          {formatRelativeTime(a.created_at)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-4 text-center text-[12px] text-[var(--text-tertiary)]">
                  暂无活动
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}