import { useEffect, useState } from "react";
import { api } from "../api";
import type { DashboardData, Task, Project, Activity as ActivityType } from "../types";
import {
  TrendingUp,
  CheckCircle2,
  Circle,
  Clock,
  Target,
  Activity as ActivityIcon,
} from "lucide-react";
import { formatRelativeTime } from "../utils";

export function Analytics() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activities, setActivities] = useState<ActivityType[]>([]);

  useEffect(() => {
    Promise.all([
      api.getDashboard(),
      api.listTasks(),
      api.listActivities(50),
    ]).then(([d, t, a]) => {
      setData(d);
      setTasks(t);
      setActivities(a);
    }).catch(console.error);
  }, []);

  const stats = data
    ? {
        completed: data.total_completed,
        pending: data.total_pending,
        progress: data.today_progress,
        projects: data.active_projects.length,
      }
    : { completed: 0, pending: 0, progress: 0, projects: 0 };

  // 按优先级分组
  const byPriority = tasks.reduce((acc, t) => {
    if (t.status === "done") return acc;
    acc[t.priority] = (acc[t.priority] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // 按状态分组
  const byStatus = tasks.reduce((acc, t) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // 按项目分组
  const byProject = tasks.reduce((acc, t) => {
    if (!t.project_id) return acc;
    acc[t.project_id] = (acc[t.project_id] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const totalTasks = tasks.length;
  const completionRate = totalTasks > 0
    ? Math.round(((byStatus.done ?? 0) / totalTasks) * 100)
    : 0;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1200px] px-8 py-8">
        <div className="mb-8">
          <h1 className="h-display">分析</h1>
          <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
            工作效率与生产力的全局视图
          </p>
        </div>

        {/* 关键指标 */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <StatCard
            label="今日完成"
            value={stats.completed}
            icon={<CheckCircle2 size={16} />}
            color="#22C55E"
          />
          <StatCard
            label="待处理"
            value={stats.pending}
            icon={<Circle size={16} />}
            color="#F59E0B"
          />
          <StatCard
            label="完成率"
            value={`${completionRate}%`}
            icon={<TrendingUp size={16} />}
            color="#3B82F6"
          />
          <StatCard
            label="活跃项目"
            value={stats.projects}
            icon={<Target size={16} />}
            color="#8B5CF6"
          />
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* 优先级分布 */}
          <div className="card p-5">
            <h3 className="h-section mb-4">优先级分布</h3>
            <div className="space-y-3">
              {[
                { id: "urgent", label: "紧急", color: "#EF4444" },
                { id: "high", label: "高", color: "#F59E0B" },
                { id: "medium", label: "中", color: "#3B82F6" },
                { id: "low", label: "低", color: "#94A3B8" },
              ].map((p) => {
                const count = byPriority[p.id] ?? 0;
                const max = Math.max(...Object.values(byPriority), 1);
                return (
                  <div key={p.id}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[12px]">{p.label}</span>
                      <span className="text-[12px] font-semibold">{count}</span>
                    </div>
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{
                          width: `${(count / max) * 100}%`,
                          backgroundColor: p.color,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 状态分布 */}
          <div className="card p-5">
            <h3 className="h-section mb-4">状态分布</h3>
            <div className="space-y-3">
              {[
                { id: "todo", label: "待办", color: "#94A3B8" },
                { id: "in_progress", label: "进行中", color: "#3B82F6" },
                { id: "done", label: "已完成", color: "#22C55E" },
              ].map((s) => {
                const count = byStatus[s.id] ?? 0;
                const max = Math.max(...Object.values(byStatus), 1);
                return (
                  <div key={s.id}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[12px]">{s.label}</span>
                      <span className="text-[12px] font-semibold">{count}</span>
                    </div>
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{
                          width: `${(count / max) * 100}%`,
                          backgroundColor: s.color,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 环形 - 完成率 */}
            <div className="mt-6 flex flex-col items-center">
              <ProgressRing value={completionRate} />
              <div className="mt-2 text-[12px] text-[var(--text-secondary)]">
                整体完成率
              </div>
            </div>
          </div>

          {/* 最近活动 */}
          <div className="card p-5">
            <h3 className="h-section mb-4 flex items-center gap-2">
              <ActivityIcon size={14} />
              最近活动
            </h3>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {activities.slice(0, 12).map((a) => (
                <div key={a.id} className="flex items-start gap-2.5">
                  <div className="mt-0.5 h-5 w-5 flex items-center justify-center rounded-md bg-[var(--bg-tertiary)] text-[var(--text-secondary)] flex-shrink-0">
                    <Clock size={10} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] truncate">{a.title}</div>
                    <div className="text-[10px] text-[var(--text-tertiary)]">
                      {formatRelativeTime(a.created_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 项目分布 */}
        {data && data.active_projects.length > 0 && (
          <div className="card p-5 mt-6">
            <h3 className="h-section mb-4">项目任务分布</h3>
            <div className="space-y-3">
              {data.active_projects.map((p) => {
                const count = byProject[p.id] ?? 0;
                const max = Math.max(...Object.values(byProject), 1);
                return (
                  <div key={p.id} className="flex items-center gap-3">
                    <div className="w-32 flex items-center gap-2 min-w-0">
                      <div
                        className="h-2 w-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: p.color }}
                      />
                      <span className="text-[12px] truncate">{p.name}</span>
                    </div>
                    <div className="flex-1 progress-bar">
                      <div
                        className="progress-fill"
                        style={{
                          width: `${(count / max) * 100}%`,
                          backgroundColor: p.color,
                        }}
                      />
                    </div>
                    <span className="text-[12px] font-semibold w-8 text-right">
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <div
          className="h-8 w-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${color}1a`, color }}
        >
          {icon}
        </div>
      </div>
      <div className="text-[24px] font-semibold">{value}</div>
      <div className="text-[11px] text-[var(--text-tertiary)] mt-1">{label}</div>
    </div>
  );
}

function ProgressRing({ value }: { value: number }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className="relative">
      <svg width="100" height="100" className="-rotate-90">
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="var(--bg-tertiary)"
          strokeWidth="8"
        />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="#3B82F6"
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-[18px] font-semibold">
        {value}%
      </div>
    </div>
  );
}