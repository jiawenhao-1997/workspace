import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { Task, Project } from "../types";
import { useAppStore } from "../store";
import { useTranslation } from "react-i18next";
import {
  Plus,
  List,
  KanbanSquare,
  Calendar as CalIcon,
  Search,
  Filter,
  X,
  CheckCircle2,
  Circle,
  Flag,
  Trash2,
  Edit3,
  Play,
} from "lucide-react";
import { cn, formatRelativeTime, isOverdue, isToday, parseTags } from "../utils";

function toDateInput(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function quickDateOptions(t: any): { label: string; value: string }[] {
  const now = new Date();
  const today = new Date(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const sunday = new Date(now);
  const dayOfWeek = sunday.getDay();
  const offset = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
  sunday.setDate(now.getDate() + offset);
  const nextMonday = new Date(now);
  nextMonday.setDate(now.getDate() + ((dayOfWeek === 0 ? 1 : 8) - dayOfWeek));
  return [
    { label: t("common.today"), value: toDateInput(today) },
    { label: t("common.tomorrow"), value: toDateInput(tomorrow) },
    { label: t("tasks.thisSunday"), value: toDateInput(sunday) },
    { label: t("tasks.nextMonday"), value: toDateInput(nextMonday) },
  ];
}

type ViewMode = "list" | "kanban" | "calendar";

function getColumns(t: any) {
  return [
    { id: "todo", label: t("common.todo"), color: "#94A3B8" },
    { id: "in_progress", label: t("common.inProgress"), color: "#3B82F6" },
    { id: "done", label: t("common.doneStatus"), color: "#22C55E" },
  ];
}

const priorityColors: Record<string, string> = {
  urgent: "text-danger bg-red-50",
  high: "text-warning bg-amber-50",
  medium: "text-accent-500 bg-blue-50",
  low: "text-[var(--text-tertiary)] bg-gray-100",
};

export function Tasks() {
  const { t } = useTranslation();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [view, setView] = useState<ViewMode>("list");
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterProject, setFilterProject] = useState<string>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);

  const columns = getColumns(t);
  const dateOptions = quickDateOptions(t);

  // 监听新建任务弹窗
  const newTaskModalOpen = useAppStore((s) => s.newTaskModalOpen);
  const closeNewTaskModal = useAppStore((s) => s.closeNewTaskModal);

  useEffect(() => {
    if (newTaskModalOpen) {
      setShowCreate(true);
      closeNewTaskModal();
    }
  }, [newTaskModalOpen]);

  async function load() {
    try {
      const [t_data, p] = await Promise.all([api.listTasks(), api.listProjects()]);
      setTasks(t_data);
      setProjects(p);
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    return tasks.filter((task) => {
      if (filterStatus !== "all" && task.status !== filterStatus) return false;
      if (filterProject !== "all" && task.project_id !== filterProject) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!task.title.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [tasks, search, filterStatus, filterProject]);

  async function toggleTask(id: string) {
    try {
      await api.toggleTask(id);
      await load();
    } catch (e) {
      console.error(e);
    }
  }

  async function startTask(id: string) {
    try {
      await api.updateTask({ id, status: "in_progress" });
      await load();
    } catch (e) {
      console.error(e);
    }
  }

  async function deleteTask(id: string) {
    if (!confirm(t("common.confirmDelete"))) return;
    try {
      await api.deleteTask(id);
      await load();
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-[var(--border)] bg-[var(--bg-primary)] px-8 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="h-display">{t("sidebar.tasks")}</h1>
            <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
              {tasks.filter((task) => task.status !== "done").length} {t("common.inProgress")} ·{" "}
              {tasks.filter((task) => task.status === "done").length} {t("common.doneStatus")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-[var(--border)] p-0.5">
              {[
                { id: "list", icon: <List size={14} />, label: t("tasks.listView") },
                { id: "kanban", icon: <KanbanSquare size={14} />, label: t("tasks.kanbanView") },
                { id: "calendar", icon: <CalIcon size={14} />, label: t("tasks.calendarView") },
              ].map((v) => (
                <button
                  key={v.id}
                  onClick={() => setView(v.id as ViewMode)}
                  className={cn(
                    "flex items-center gap-1 rounded-md px-2.5 py-1 text-[12px] transition-colors",
                    view === v.id
                      ? "bg-[var(--bg-tertiary)] text-[var(--text-primary)]"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  )}
                >
                  {v.icon}
                  {v.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="btn btn-primary"
            >
              <Plus size={14} />
              {t("tasks.newTask")}
            </button>
          </div>
        </div>

        {/* 搜索与筛选 */}
        <div className="mt-4 flex items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-1.5">
            <Search size={14} className="text-[var(--text-tertiary)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onCompositionStart={(e) => e.stopPropagation()}
              onCompositionEnd={(e) => setSearch(e.target.value)}
              placeholder={t("tasks.searchPlaceholder")}
              className="flex-1 bg-transparent text-[13px] outline-none"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="input w-auto"
          >
            <option value="all">{t("tasks.allStatus")}</option>
            <option value="todo">{t("common.todo")}</option>
            <option value="in_progress">{t("common.inProgress")}</option>
            <option value="done">{t("common.doneStatus")}</option>
          </select>
          <select
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)}
            className="input w-auto"
          >
            <option value="all">{t("tasks.allProjects")}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto bg-[var(--bg-secondary)] p-8">
        {view === "list" && (
          <ListView
            tasks={filtered}
            projects={projects}
            onToggle={toggleTask}
            onEdit={setEditing}
            onDelete={deleteTask}
            onStart={startTask}
          />
        )}
        {view === "kanban" && (
          <KanbanView
            tasks={filtered}
            projects={projects}
            columns={columns}
            onToggle={toggleTask}
            onUpdate={async (id, status) => {
              await api.updateTask({ id, status });
              await load();
            }}
          />
        )}
        {view === "calendar" && (
          <CalendarView tasks={filtered} projects={projects} />
        )}
      </div>

      {showCreate && (
        <TaskModal
          projects={projects}
          dateOptions={dateOptions}
          onClose={() => setShowCreate(false)}
          onSaved={async () => {
            setShowCreate(false);
            await load();
          }}
        />
      )}

      {editing && (
        <TaskModal
          projects={projects}
          dateOptions={dateOptions}
          task={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

// ==================== 列表视图 ====================

function ListView({
  tasks,
  projects,
  onToggle,
  onEdit,
  onDelete,
  onStart,
}: {
  tasks: Task[];
  projects: Project[];
  onToggle: (id: string) => void;
  onEdit: (t: Task) => void;
  onDelete: (id: string) => void;
  onStart: (id: string) => void;
}) {
  const { t } = useTranslation();

  if (tasks.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center text-[var(--text-tertiary)]">
        <Circle size={32} className="mb-3 opacity-30" />
        <div className="text-[13px]">{t("tasks.noTasks")}</div>
      </div>
    );
  }

  const projectMap = new Map(projects.map((p) => [p.id, p]));

  return (
    <div className="mx-auto max-w-[900px] space-y-1 rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] p-2">
      {tasks.map((task) => {
        const project = task.project_id ? projectMap.get(task.project_id) : null;
        const tags = parseTags(task.tags);
        return (
          <div
            key={task.id}
            className="task-item group rounded-lg hover:bg-[var(--bg-hover)]"
          >
            <button
              onClick={() => onToggle(task.id)}
              className={cn(
                "task-checkbox",
                task.status === "done" && "checked"
              )}
            >
              {task.status === "done" && (
                <CheckCircle2 size={12} className="text-white" />
              )}
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "text-[13px] truncate",
                    task.status === "done" &&
                      "line-through text-[var(--text-tertiary)]"
                  )}
                >
                  {task.title}
                </div>
                {project && (
                  <span
                    className="pill"
                    style={{
                      backgroundColor: `${project.color}1a`,
                      color: project.color,
                    }}
                  >
                    {project.name}
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--text-tertiary)]">
                {task.due_date && (
                  <span
                    className={cn(
                      isOverdue(task.due_date) && task.status !== "done"
                        ? "text-danger"
                        : isToday(task.due_date)
                        ? "text-accent-500"
                        : ""
                    )}
                  >
                    {task.due_date}
                  </span>
                )}
                {tags.map((tag) => (
                  <span key={tag} className="pill bg-[var(--bg-tertiary)]">
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
            <span className={cn("pill", priorityColors[task.priority])}>
              <Flag size={10} />
              {t(`common.${task.priority}`)}
            </span>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {task.status === "todo" && (
                <button
                  onClick={() => onStart(task.id)}
                  className="btn btn-icon text-accent-500 hover:bg-accent-50"
                  aria-label={t("tasks.start")}
                >
                  <Play size={12} />
                </button>
              )}
              <button
                onClick={() => onEdit(task)}
                className="btn btn-ghost btn-icon"
                aria-label={t("common.edit")}
              >
                <Edit3 size={12} />
              </button>
              <button
                onClick={() => onDelete(task.id)}
                className="btn btn-danger btn-icon"
                aria-label={t("common.delete")}
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ==================== 看板视图 ====================

function KanbanView({
  tasks,
  projects,
  columns,
  onToggle,
  onUpdate,
}: {
  tasks: Task[];
  projects: Project[];
  columns: { id: string; label: string; color: string }[];
  onToggle: (id: string) => void;
  onUpdate: (id: string, status: string) => void;
}) {
  const { t } = useTranslation();
  const [dragOver, setDragOver] = useState<string | null>(null);

  return (
    <div className="grid grid-cols-3 gap-4 h-full">
      {columns.map((col) => {
        const colTasks = tasks.filter((task) => task.status === col.id);
        return (
          <div
            key={col.id}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(col.id);
            }}
            onDragLeave={() => setDragOver(null)}
            onDrop={async (e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("text/plain");
              if (id) {
                await onUpdate(id, col.id);
              }
              setDragOver(null);
            }}
            className={cn(
              "flex flex-col rounded-2xl border bg-[var(--bg-primary)] p-3 transition-colors",
              dragOver === col.id
                ? "border-accent-500 bg-accent-50/30"
                : "border-[var(--border)]"
            )}
          >
            <div className="mb-3 flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <div
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: col.color }}
                />
                <span className="text-[12px] font-semibold">{col.label}</span>
                <span className="text-[11px] text-[var(--text-tertiary)]">
                  {colTasks.length}
                </span>
              </div>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto scrollbar-none">
              {colTasks.map((task) => {
                const project = projects.find((p) => p.id === task.project_id);
                const tags = parseTags(task.tags);
                return (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", task.id);
                    }}
                    className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-3 cursor-grab active:cursor-grabbing hover:border-[var(--border-strong)] transition-all"
                  >
                    <div className="flex items-start gap-2 mb-2">
                      <button
                        onClick={() => onToggle(task.id)}
                        className={cn(
                          "task-checkbox mt-0.5",
                          task.status === "done" && "checked"
                        )}
                      >
                        {task.status === "done" && (
                          <CheckCircle2 size={12} className="text-white" />
                        )}
                      </button>
                      <div
                        className={cn(
                          "text-[13px] flex-1",
                          task.status === "done" && "line-through text-[var(--text-tertiary)]"
                        )}
                      >
                        {task.title}
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className={cn("pill", priorityColors[task.priority])}>
                        <Flag size={10} />
                        {t(`common.${task.priority}`)}
                      </span>
                      <div className="flex items-center gap-1">
                        {project && (
                          <span
                            className="pill"
                            style={{
                              backgroundColor: `${project.color}1a`,
                              color: project.color,
                            }}
                          >
                            {project.name}
                          </span>
                        )}
                      </div>
                    </div>
                    {task.due_date && (
                      <div
                        className={cn(
                          "mt-2 text-[10px]",
                          isOverdue(task.due_date) && task.status !== "done"
                            ? "text-danger"
                            : "text-[var(--text-tertiary)]"
                        )}
                      >
                        {task.due_date}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ==================== 日历视图 ====================

function CalendarView({
  tasks,
  projects,
}: {
  tasks: Task[];
  projects: Project[];
}) {
  const { t } = useTranslation();
  const [currentDate, setCurrentDate] = useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startWeekday = (firstDay.getDay() + 6) % 7; // 周一开始
  const daysInMonth = lastDay.getDate();

  const days: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);

  const projectMap = new Map(projects.map((p) => [p.id, p]));

  function tasksForDay(day: number) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return tasks.filter((task) => task.due_date?.startsWith(dateStr));
  }

  const today = new Date();
  const weekdays = [
    t("calendar.mon"),
    t("calendar.tue"),
    t("calendar.wed"),
    t("calendar.thu"),
    t("calendar.fri"),
    t("calendar.sat"),
    t("calendar.sun"),
  ];

  return (
    <div className="mx-auto max-w-[1000px]">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="h-section">
          {year} {t("calendar.year")} {month + 1} {t("calendar.month")}
        </h2>
        <div className="flex gap-1">
          <button
            onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
            className="btn btn-secondary"
          >
            ←
          </button>
          <button
            onClick={() => setCurrentDate(new Date())}
            className="btn btn-secondary"
          >
            {t("common.today")}
          </button>
          <button
            onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
            className="btn btn-secondary"
          >
            →
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] p-4">
        <div className="grid grid-cols-7 mb-2">
          {weekdays.map((d) => (
            <div
              key={d}
              className="text-center text-[11px] font-semibold text-[var(--text-tertiary)] py-2"
            >
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((day, idx) => {
            if (day === null) {
              return <div key={idx} className="aspect-square" />;
            }
            const dayTasks = tasksForDay(day);
            const isCurrentDay =
              today.getFullYear() === year &&
              today.getMonth() === month &&
              today.getDate() === day;

            return (
              <div
                key={idx}
                className={cn(
                  "aspect-square rounded-lg border border-transparent p-1.5 hover:border-[var(--border)] hover:bg-[var(--bg-secondary)] transition-colors",
                  isCurrentDay && "border-accent-500 bg-accent-50/40"
                )}
              >
                <div
                  className={cn(
                    "text-[11px] font-medium mb-1",
                    isCurrentDay
                      ? "text-accent-500"
                      : "text-[var(--text-secondary)]"
                  )}
                >
                  {day}
                </div>
                <div className="space-y-0.5 overflow-hidden">
                  {dayTasks.slice(0, 3).map((task) => {
                    const project = task.project_id
                      ? projectMap.get(task.project_id)
                      : null;
                    return (
                      <div
                        key={task.id}
                        className="truncate rounded px-1 py-0.5 text-[10px]"
                        style={{
                          backgroundColor: project
                            ? `${project.color}1a`
                            : "var(--bg-tertiary)",
                          color: project
                            ? project.color
                            : "var(--text-secondary)",
                        }}
                      >
                        {task.title}
                      </div>
                    );
                  })}
                  {dayTasks.length > 3 && (
                    <div className="text-[9px] text-[var(--text-tertiary)] px-1">
                      {t("calendar.moreTasks", { count: dayTasks.length - 3 })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ==================== 任务弹窗 ====================

function TaskModal({
  projects,
  dateOptions,
  task,
  onClose,
  onSaved,
}: {
  projects: Project[];
  dateOptions: { label: string; value: string }[];
  task?: Task;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [projectId, setProjectId] = useState(task?.project_id ?? "");
  const [priority, setPriority] = useState(task?.priority ?? "medium");
  const [status, setStatus] = useState(task?.status ?? "todo");
  const [dueDate, setDueDate] = useState(task?.due_date ?? "");
  const [tagsInput, setTagsInput] = useState(parseTags(task?.tags).join(", "));
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const tags = tagsInput
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (task) {
        await api.updateTask({
          id: task.id,
          title,
          description,
          priority,
          status,
          due_date: dueDate || undefined,
          tags,
        });
      } else {
        await api.createTask({
          title,
          description,
          project_id: projectId || undefined,
          priority,
          due_date: dueDate || undefined,
          tags,
        });
      }
      onSaved();
    } catch (e) {
      console.error(e);
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
      <div className="w-[480px] rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-soft-lg animate-fade-in-scale">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
          <h2 className="text-[14px] font-semibold">
            {task ? t("tasks.editTask") : t("tasks.newTask")}
          </h2>
          <button onClick={onClose} className="btn btn-ghost btn-icon">
            <X size={14} />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("tasks.titlePlaceholder")}
            className="input"
            autoFocus
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("tasks.descPlaceholder")}
            rows={3}
            className="input h-auto py-2"
          />
          <div className="grid grid-cols-2 gap-3">
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="input"
            >
              <option value="">{t("tasks.noProject")}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="input"
            >
              <option value="urgent">{t("common.urgent")}</option>
              <option value="high">{t("tasks.highPriority")}</option>
              <option value="medium">{t("tasks.mediumPriority")}</option>
              <option value="low">{t("tasks.lowPriority")}</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="input"
            >
              <option value="todo">{t("common.todo")}</option>
              <option value="in_progress">{t("common.inProgress")}</option>
              <option value="done">{t("common.doneStatus")}</option>
            </select>
            <div></div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] text-[var(--text-tertiary)]">{t("tasks.dueDate")}</label>
              {dueDate && (
                <button
                  type="button"
                  onClick={() => setDueDate("")}
                  className="text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                >
                  {t("common.clear")}
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {dateOptions.map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setDueDate(opt.value)}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-[11px] transition-colors",
                    dueDate === opt.value
                      ? "bg-accent-500 text-white"
                      : "bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]"
                  )}
                >
                  {opt.label}
                </button>
              ))}
              <input
                type="date"
                value={dueDate ? dueDate.substring(0, 10) : ""}
                onChange={(e) => setDueDate(e.target.value)}
                className="input flex-1 min-w-[120px] py-1 text-[12px]"
              />
            </div>
          </div>
          <input
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder={t("tasks.tagsPlaceholder")}
            className="input"
          />
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
          <button onClick={onClose} className="btn btn-ghost">
            {t("common.cancel")}
          </button>
          <button
            onClick={save}
            disabled={!title.trim() || saving}
            className="btn btn-primary"
          >
            {saving ? t("common.saving") : t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}