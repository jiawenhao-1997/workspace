import { useEffect, useState } from "react";
import { api } from "../api";
import type { Project, Task } from "../types";
import { useTranslation } from "react-i18next";
import {
  Plus,
  Folder,
  Calendar,
  User,
  MoreHorizontal,
  X,
  CheckSquare,
  Circle,
  Flag,
  Trash2,
} from "lucide-react";
import { cn, formatRelativeTime, formatDate, parseTags } from "../utils";

export function Projects() {
  const { t } = useTranslation();
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  async function load() {
    try {
      const ps = await api.listProjects();
      setProjects(ps);
      if (!activeId && ps.length > 0) {
        setActiveId(ps[0].id);
      }
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const active = projects.find((p) => p.id === activeId) ?? null;

  async function deleteProject(id: string) {
    if (!confirm(t("projects.confirmDelete"))) return;
    try {
      await api.deleteProject(id);
      if (activeId === id) setActiveId(null);
      await load();
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <div className="flex h-full">
      {/* 项目列表 */}
      <div className="w-[320px] flex-shrink-0 border-r border-[var(--border)] bg-[var(--bg-primary)] flex flex-col">
        <div className="border-b border-[var(--border)] px-5 py-4">
          <div className="flex items-center justify-between mb-1">
            <h1 className="text-[18px] font-semibold">{t("sidebar.projects")}</h1>
            <button
              onClick={() => setShowCreate(true)}
              className="btn btn-primary btn-icon"
              aria-label={t("common.new")}
            >
              <Plus size={14} />
            </button>
          </div>
          <p className="text-[12px] text-[var(--text-tertiary)]">
            {t("projects.activeProjects", { count: projects.filter((p) => p.status === "active").length })}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-[var(--text-tertiary)] px-4 text-center">
              <Folder size={28} className="mb-3 opacity-30" />
              <div className="text-[13px] mb-3">{t("projects.noProjects")}</div>
              <button
                onClick={() => setShowCreate(true)}
                className="btn btn-primary"
              >
                <Plus size={14} />
                {t("projects.newProject")}
              </button>
            </div>
          ) : (
            projects.map((p) => (
              <button
                key={p.id}
                onClick={() => setActiveId(p.id)}
                className={cn(
                  "w-full text-left px-3 py-2.5 rounded-lg mb-0.5 transition-colors",
                  activeId === p.id
                    ? "bg-[var(--bg-tertiary)]"
                    : "hover:bg-[var(--bg-hover)]"
                )}
              >
                <div className="flex items-center gap-2">
                  <div
                    className="h-2 w-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: p.color }}
                  />
                  <div className="text-[13px] font-medium truncate flex-1">
                    {p.name}
                  </div>
                  {p.status !== "active" && (
                    <span className="pill bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]">
                      {p.status}
                    </span>
                  )}
                </div>
                <div className="mt-1.5 ml-4">
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{
                        width: `${p.progress}%`,
                        backgroundColor: p.color,
                      }}
                    />
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[10px] text-[var(--text-tertiary)]">
                    <span>{p.progress}%</span>
                    <span>{formatRelativeTime(p.updated_at)}</span>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* 项目详情 */}
      <div className="flex-1 overflow-y-auto bg-[var(--bg-secondary)]">
        {active ? (
          <ProjectDetail
            project={active}
            onDelete={() => deleteProject(active.id)}
            onUpdate={load}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-[var(--text-tertiary)]">
            <Folder size={48} className="mb-4 opacity-20" />
            <div className="text-[14px] mb-4">{t("projects.selectToView")}</div>
            <button
              onClick={() => setShowCreate(true)}
              className="btn btn-primary"
            >
              <Plus size={14} />
              {t("projects.newProject")}
            </button>
          </div>
        )}
      </div>

      {showCreate && (
        <ProjectCreateModal
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

function ProjectDetail({
  project,
  onDelete,
  onUpdate,
}: {
  project: Project;
  onDelete: () => void;
  onUpdate: () => void;
}) {
  const [tab, setTab] = useState<"overview" | "tasks" | "activity">("overview");
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    api
      .listTasks({ project_id: project.id })
      .then(setTasks)
      .catch(console.error);
  }, [project.id]);

  async function setProgress(progress: number) {
    try {
      await api.updateProject({ id: project.id, progress });
      onUpdate();
    } catch (e) {
      console.error(e);
    }
  }

  async function setProgressMode(mode: "manual" | "auto") {
    try {
      await api.updateProject({ id: project.id, progress_mode: mode });
      onUpdate();
    } catch (e) {
      console.error(e);
    }
  }

  async function toggleTask(id: string) {
    try {
      await api.toggleTask(id);
      const ts = await api.listTasks({ project_id: project.id });
      setTasks(ts);
      onUpdate();
    } catch (e) {
      console.error(e);
    }
  }

  const completed = tasks.filter((t) => t.status === "done").length;
  const total = tasks.length;
  const mode = project.progress_mode || "manual"; // 兼容 null 和空字符串

  return (
    <div className="mx-auto max-w-[900px] px-8 py-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start gap-3 mb-3">
          <div
            className="h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${project.color}1a` }}
          >
            <Folder size={20} style={{ color: project.color }} />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="h-display">{project.name}</h1>
            {project.description && (
              <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
                {project.description}
              </p>
            )}
          </div>
          <button
            onClick={onDelete}
            className="btn btn-danger btn-icon"
            aria-label="删除"
          >
            <Trash2 size={14} />
          </button>
        </div>

        <div className="flex items-center gap-4 text-[12px] text-[var(--text-secondary)]">
          {project.owner && (
            <div className="flex items-center gap-1.5">
              <User size={12} />
              {project.owner}
            </div>
          )}
          {project.target_date && (
            <div className="flex items-center gap-1.5">
              <Calendar size={12} />
              {project.target_date}
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <CheckSquare size={12} />
            {completed} / {total} 任务完成
          </div>
        </div>

        {/* P1-5: 进度 */}
        <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
              整体进度
            </span>
            <div className="flex items-center gap-2">
              {mode === "auto" && (
                <span className="text-[11px] text-[var(--text-tertiary)]">
                  {completed}/{total} 任务已完成
                </span>
              )}
              <span className="text-[14px] font-semibold">{project.progress}%</span>
            </div>
          </div>

          {/* P1-5: 进度模式切换 */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[11px] text-[var(--text-tertiary)]">计算方式</span>
            <div className="flex rounded-lg border border-[var(--border)] overflow-hidden text-[11px]">
              <button
                className={cn(
                  "px-2.5 py-1 transition-colors",
                  mode === "manual"
                    ? "bg-accent-500 text-white"
                    : "bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                )}
                onClick={() => setProgressMode("manual")}
              >
                手动
              </button>
              <button
                className={cn(
                  "px-2.5 py-1 transition-colors",
                  mode === "auto"
                    ? "bg-accent-500 text-white"
                    : "bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                )}
                onClick={() => setProgressMode("auto")}
              >
                按任务完成率
              </button>
            </div>
          </div>

          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{
                width: `${project.progress}%`,
                backgroundColor: project.color,
              }}
            />
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={project.progress}
            onChange={(e) => setProgress(parseInt(e.target.value))}
            disabled={mode === "auto"}
            className="w-full mt-3 accent-current disabled:opacity-40"
            style={{ accentColor: project.color }}
          />
          {mode === "auto" && (
            <div className="mt-1.5 text-[10.5px] text-[var(--text-tertiary)] text-center">
              自动计算：勾选任务即可更新进度
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--border)] mb-6">
        {[
          { id: "overview", label: "概览" },
          { id: "tasks", label: `任务 (${total})` },
          { id: "activity", label: "活动" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as any)}
            className={cn(
              "px-4 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors",
              tab === t.id
                ? "border-accent-500 text-[var(--text-primary)]"
                : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === "overview" && (
        <div className="grid grid-cols-2 gap-4">
          <div className="card p-4">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
              创建时间
            </div>
            <div className="text-[13px]">{formatDate(project.created_at)}</div>
          </div>
          <div className="card p-4">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
              最近更新
            </div>
            <div className="text-[13px]">{formatRelativeTime(project.updated_at)}</div>
          </div>
          <div className="card p-4">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
              任务完成
            </div>
            <div className="text-[13px]">
              <span className="text-success font-semibold">{completed}</span> /{" "}
              <span className="text-[var(--text-secondary)]">{total}</span>
            </div>
          </div>
          <div className="card p-4">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
              状态
            </div>
            <div className="text-[13px]">
              <span
                className={cn(
                  "pill",
                  project.status === "active"
                    ? "bg-green-50 text-success"
                    : "bg-gray-100 text-[var(--text-tertiary)]"
                )}
              >
                {project.status}
              </span>
            </div>
          </div>
        </div>
      )}

      {tab === "tasks" && (
        <div className="space-y-1">
          {tasks.length === 0 ? (
            <div className="text-center py-12 text-[var(--text-tertiary)] text-[13px]">
              这个项目还没有任务
            </div>
          ) : (
            tasks.map((t) => (
              <div
                key={t.id}
                className="task-item rounded-lg border border-[var(--border)] bg-[var(--bg-primary)]"
              >
                <button
                  onClick={() => toggleTask(t.id)}
                  className={cn(
                    "task-checkbox",
                    t.status === "done" && "checked"
                  )}
                >
                  {t.status === "done" && (
                    <CheckSquare size={10} className="text-white" />
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
                    <div className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
                      {t.due_date}
                    </div>
                  )}
                </div>
                <span className="pill bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
                  <Flag size={10} />
                  {t.priority}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {tab === "activity" && (
        <div className="text-center py-12 text-[var(--text-tertiary)] text-[13px]">
          暂无活动记录
        </div>
      )}
    </div>
  );
}

function ProjectCreateModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#3B82F6");
  const [owner, setOwner] = useState("");
  const [targetDate, setTargetDate] = useState("");

  const colors = [
    "#3B82F6",
    "#22C55E",
    "#F59E0B",
    "#EF4444",
    "#8B5CF6",
    "#EC4899",
    "#06B6D4",
    "#64748B",
  ];

  async function create() {
    if (!name.trim()) return;
    try {
      const p = await api.createProject({
        name,
        description: description || undefined,
        color,
        owner: owner || undefined,
      });
      if (targetDate) {
        await api.updateProject({ id: p.id, target_date: targetDate });
      }
      onCreated(p.id);
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
      <div className="w-[480px] rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-soft-lg animate-fade-in-scale">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
          <h2 className="text-[14px] font-semibold">新建项目</h2>
          <button onClick={onClose} className="btn btn-ghost btn-icon">
            <X size={14} />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="项目名称"
            className="input"
            autoFocus
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="项目描述（可选）"
            rows={2}
            className="input h-auto py-2"
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              placeholder="负责人"
              className="input"
            />
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <div className="text-[11px] text-[var(--text-secondary)] mb-2">
              颜色
            </div>
            <div className="flex gap-2">
              {colors.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={cn(
                    "h-7 w-7 rounded-full transition-transform",
                    color === c
                      ? "ring-2 ring-offset-2 ring-[var(--accent)] scale-110"
                      : ""
                  )}
                  style={{ backgroundColor: c }}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
          <button onClick={onClose} className="btn btn-ghost">
            取消
          </button>
          <button onClick={create} disabled={!name.trim()} className="btn btn-primary">
            创建
          </button>
        </div>
      </div>
    </div>
  );
}