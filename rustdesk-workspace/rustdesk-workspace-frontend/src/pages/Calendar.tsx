import { useEffect, useState } from "react";
import { api } from "../api";
import type { CalendarEvent } from "../types";
import { useTranslation } from "react-i18next";
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  X,
  Clock,
  Calendar as CalIcon,
  Bell,
  BellOff,
  Calendar,
  Pencil,
} from "lucide-react";
import { cn } from "../utils";
import { TimePicker } from "../components/TimePicker";

export function CalendarPage() {
  const { t } = useTranslation();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showCreate, setShowCreate] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [showDayDrawer, setShowDayDrawer] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [dragOverDay, setDragOverDay] = useState<number | null>(null);
  const [draggingEventId, setDraggingEventId] = useState<string | null>(null);

  async function load() {
    try {
      const es = await api.listEvents();
      setEvents(es);
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startWeekday = (firstDay.getDay() + 6) % 7;
  const daysInMonth = lastDay.getDate();

  const days: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);

  const today = new Date();

  function eventsForDay(day: number) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return events.filter((e) => e.start_time.startsWith(dateStr));
  }

  async function handleDrop(targetDate: Date, e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();

    // WKWebView 中 dataTransfer.getData 在 drop 时可能返回空串，回退用 onDragStart 记录的 state
    const eventId = e.dataTransfer.getData("text/plain") || draggingEventId;

    if (!eventId) {
      console.error("没有正在拖拽的事件");
      return;
    }

    const event = events.find(ev => ev.id === eventId);
    if (!event) {
      console.error("未找到事件:", eventId);
      return;
    }

    const newDate = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, "0")}-${String(targetDate.getDate()).padStart(2, "0")}`;
    const timePart = event.start_time.substring(11) || "09:00:00";
    const newStartTime = `${newDate}T${timePart}`;

    try {
      await api.updateEvent({
        id: eventId,
        startTime: newStartTime,
      });
      await load();
    } catch (err) {
      console.error("更新失败", err);
    } finally {
      setDraggingEventId(null);
      setDragOverDay(null);
    }
  }

  const monthNames = t("calendar.monthNames", { returnObjects: true }) as string[];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-[var(--border)] bg-[var(--bg-primary)] px-8 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="h-display">{t("sidebar.calendar")}</h1>
            <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
              {t("calendar.eventsCount", { count: events.length })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
              className="btn btn-secondary"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              onClick={() => setCurrentDate(new Date())}
              className="btn btn-secondary"
            >
              {t("calendar.today")}
            </button>
            <button
              onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
              className="btn btn-secondary"
            >
              <ChevronRight size={14} />
            </button>
            <button
              onClick={() => { console.log("点击新建事件"); setShowCreate(true); }}
              className="btn btn-primary"
            >
              <Plus size={14} />
              {t("calendar.newEvent")}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-[var(--bg-secondary)] p-8">
        <div className="mx-auto max-w-[1100px]">
          <div className="mb-4">
            <h2 className="h-section">
              {year} {t("calendar.year")} {monthNames[month]}
            </h2>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] p-4">
            <div className="grid grid-cols-7 mb-2">
              {[t("calendar.mon"), t("calendar.tue"), t("calendar.wed"), t("calendar.thu"), t("calendar.fri"), t("calendar.sat"), t("calendar.sun")].map((d) => (
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
                const dayEvents = eventsForDay(day);
                const isCurrentDay =
                  today.getFullYear() === year &&
                  today.getMonth() === month &&
                  today.getDate() === day;
                const isSelected = selectedDay === day;

                return (
                  <div
                    key={idx}
                    onClick={() => { setSelectedDay(day); setShowDayDrawer(true); }}
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "move"; }}
                    onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverDay(day); }}
                    onDragLeave={(e) => {
                      e.stopPropagation();
                      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                        setDragOverDay(null);
                      }
                    }}
                    onDrop={(e) => {
                      e.stopPropagation();
                      const targetDate = new Date(year, month, day);
                      handleDrop(targetDate, e);
                      setDragOverDay(null);
                    }}
                    className={cn(
                      "aspect-square rounded-lg border p-1.5 text-left transition-colors overflow-hidden cursor-pointer",
                      dragOverDay === day
                        ? "border-accent-500 border-2 bg-accent-50/30"
                        : isCurrentDay
                        ? "border-accent-500 bg-accent-50/40"
                        : selectedDay === day
                        ? "border-[var(--border-strong)] bg-[var(--bg-secondary)]"
                        : "border-transparent hover:bg-[var(--bg-secondary)]"
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
                    <div className="space-y-0.5">
                      {dayEvents.slice(0, 3).map((e) => (
                        <div
                          key={e.id}
                          draggable
                          onDragStart={(ev) => {
                            ev.dataTransfer.effectAllowed = "move";
                            ev.dataTransfer.setData("text/plain", e.id);
                            setDraggingEventId(e.id);
                          }}
                          onDragEnd={() => {
                            setDraggingEventId(null);
                            setDragOverDay(null);
                          }}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setSelectedDay(day);
                            setEditingEvent(e);
                            setShowDayDrawer(true);
                          }}
                          className="truncate rounded px-1 py-0.5 text-[10px] text-white cursor-move hover:opacity-80"
                          style={{ backgroundColor: e.color }}
                        >
                          {e.title}
                        </div>
                      ))}
                      {dayEvents.length > 3 && (
                        <div className="text-[9px] text-[var(--text-tertiary)] px-1">
                          +{dayEvents.length - 3}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 选中日的详情 */}
        </div>
      </div>

      {/* 选中日详情抽屉 */}
      {showDayDrawer && selectedDay !== null && (
        <DayEventsDrawer
          date={`${year}-${String(month + 1).padStart(2, "0")}-${String(selectedDay).padStart(2, "0")}`}
          month={month + 1}
          day={selectedDay}
          events={eventsForDay(selectedDay)}
          onClose={() => { setShowDayDrawer(false); setEditingEvent(null); }}
          onDeleted={load}
          onEdit={(e) => setEditingEvent(e)}
        />
      )}

      {editingEvent && (
        <EventEditModal
          event={editingEvent}
          onClose={() => setEditingEvent(null)}
          onSaved={async () => {
            setEditingEvent(null);
            await load();
          }}
        />
      )}

      {showCreate && (
        <EventCreateModal
          onClose={() => setShowCreate(false)}
          onCreated={async () => {
            setShowCreate(false);
            await load();
          }}
        />
      )}
    </div>
  );
}

function EventCreateModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(new Date().toISOString().substring(0, 10));
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [allDay, setAllDay] = useState(false);
  const [color, setColor] = useState("#3B82F6");
  const [remindEnabled, setRemindEnabled] = useState(true);
  const [remindMinutes, setRemindMinutes] = useState(15);
  const [remindHour, setRemindHour] = useState(9);

  const colors = ["#3B82F6", "#22C55E", "#F59E0B", "#EF4444", "#8B5CF6"];
  const remindOptions = [
    { value: 5, label: t("calendar.remindOptions.5") },
    { value: 10, label: t("calendar.remindOptions.10") },
    { value: 15, label: t("calendar.remindOptions.15") },
    { value: 30, label: t("calendar.remindOptions.30") },
    { value: 60, label: t("calendar.remindOptions.60") },
    { value: 120, label: t("calendar.remindOptions.120") },
  ];
  const hourOptions = Array.from({ length: 24 }, (_, i) => i);

  async function create() {
    if (!title.trim()) return;
    try {
      let finalRemindMinutes: number | null = null;
      if (remindEnabled) {
        if (allDay) {
          finalRemindMinutes = -(remindHour * 60);
        } else {
          finalRemindMinutes = remindMinutes;
        }
      }

      await api.createEvent({
        title,
        description: description || undefined,
        startTime: allDay ? `${date}T00:00:00` : `${date}T${startTime}:00`,
        endTime: allDay ? undefined : `${date}T${endTime}:00`,
        allDay,
        color,
        remindMinutes: finalRemindMinutes,
      });
      onCreated();
    } catch (e: any) {
      alert(t("createError") + ": " + (e?.message || String(e)));
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center backdrop-anim"
      style={{ backgroundColor: "rgba(15, 23, 42, 0.4)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-[460px] rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-soft-lg animate-fade-in-scale">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
          <h2 className="text-[14px] font-semibold flex items-center gap-2">
            <CalIcon size={14} />
            {t("calendar.createEvent")}
          </h2>
          <button onClick={onClose} className="btn btn-ghost btn-icon">
            <X size={14} />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("calendar.eventTitle")}
            className="input"
            autoFocus
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("calendar.eventDesc")}
            rows={2}
            className="input h-auto py-2"
          />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="input"
          />
          <label className="flex items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="rounded"
            />
            {t("calendar.allDay")}
          </label>
          {!allDay && (
            <div className="grid grid-cols-2 gap-3">
              <TimePicker
                value={startTime}
                onChange={setStartTime}
                label={t("calendar.startTime")}
              />
              <TimePicker
                value={endTime}
                onChange={setEndTime}
                label={t("calendar.endTime")}
              />
            </div>
          )}
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-[13px] cursor-pointer">
              <button
                onClick={() => setRemindEnabled(!remindEnabled)}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] transition-colors",
                  remindEnabled
                    ? "bg-accent-100 text-accent-600"
                    : "bg-[var(--bg-secondary)] text-[var(--text-tertiary)]"
                )}
              >
                {remindEnabled ? <Bell size={12} /> : <BellOff size={12} />}
                {remindEnabled ? t("calendar.remind") : t("calendar.noRemind")}
              </button>
            </label>
            {remindEnabled && (
              <div className="flex items-center gap-2 flex-1">
                {allDay ? (
                  <>
                    <span className="text-[12px] text-[var(--text-secondary)]">{t("calendar.today")}</span>
                    <select
                      value={remindHour}
                      onChange={(e) => setRemindHour(Number(e.target.value))}
                      className="input text-[13px] py-1.5 w-20"
                    >
                      {hourOptions.map((h) => (
                        <option key={h} value={h}>
                          {String(h).padStart(2, "0")}:00
                        </option>
                      ))}
                    </select>
                    <span className="text-[12px] text-[var(--text-secondary)]">{t("calendar.remind")}</span>
                  </>
                ) : (
                  <select
                    value={remindMinutes}
                    onChange={(e) => setRemindMinutes(Number(e.target.value))}
                    className="input text-[13px] py-1.5 flex-1"
                  >
                    {remindOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </div>
          <div>
            <div className="text-[11px] text-[var(--text-secondary)] mb-2">
              {t("calendar.color")}
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
                />
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
          <button onClick={onClose} className="btn btn-ghost">
            {t("calendar.cancel")}
          </button>
          <button onClick={create} className="btn btn-primary">
            {t("common.create")}
          </button>
        </div>
      </div>
    </div>
  );
}

// 选中日事件详情抽屉
function DayEventsDrawer({
  date,
  month,
  day,
  events,
  onClose,
  onDeleted,
  onEdit,
}: {
  date: string;
  month: number;
  day: number;
  events: CalendarEvent[];
  onClose: () => void;
  onDeleted: () => void;
  onEdit: (e: CalendarEvent) => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end backdrop-anim"
      style={{ backgroundColor: "rgba(15, 23, 42, 0.3)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="h-full w-[380px] bg-[var(--bg-primary)] border-l border-[var(--border)] shadow-soft-lg animate-slide-in-right flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <div>
            <h2 className="text-[16px] font-semibold">
              {t("calendar.todayOfMonth", { month, day })}
            </h2>
            <p className="text-[12px] text-[var(--text-secondary)]">
              {t("calendar.eventsCount", { count: events.length })}
            </p>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-icon">
            <X size={16} />
          </button>
        </div>

        {/* 事件列表 */}
        <div className="flex-1 overflow-y-auto p-5">
          {events.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-12 h-12 rounded-full bg-[var(--bg-secondary)] flex items-center justify-center mx-auto mb-3">
                <Calendar size={20} className="text-[var(--text-tertiary)]" />
              </div>
              <p className="text-[13px] text-[var(--text-tertiary)]">
                {t("calendar.noEventToday")}
              </p>
              <p className="text-[12px] text-[var(--text-tertiary)] mt-1">
                {t("calendar.addEventHint")}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {events.map((e) => (
                <div
                  key={e.id}
                  className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <div
                          className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: e.color }}
                        />
                        <span className="text-[14px] font-semibold truncate">
                          {e.title}
                        </span>
                      </div>
                      <div className="text-[12px] text-[var(--text-secondary)] flex items-center gap-1.5">
                        <Clock size={11} />
                        {e.all_day
                          ? t("calendar.allDay")
                          : e.start_time.substring(11, 16) +
                            (e.end_time ? ` - ${e.end_time.substring(11, 16)}` : "")}
                      </div>
                      {e.description && (
                        <div className="mt-2 text-[12px] text-[var(--text-secondary)] line-clamp-2">
                          {e.description}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => onEdit(e)}
                        className="btn btn-ghost btn-icon"
                        aria-label={t("calendar.editEventAction")}
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        onClick={async () => {
                          await api.deleteEvent(e.id);
                          await onDeleted();
                          if (events.length === 1) {
                            onClose();
                          }
                        }}
                        className="btn btn-danger btn-icon"
                        aria-label={t("calendar.deleteEventAction")}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// 事件编辑弹窗
function EventEditModal({
  event,
  onClose,
  onSaved,
}: {
  event: CalendarEvent;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState(event.description || "");
  const [date, setDate] = useState(event.start_time.substring(0, 10));
  const [startTime, setStartTime] = useState(event.start_time.substring(11, 16));
  const [endTime, setEndTime] = useState(event.end_time?.substring(11, 16) || "10:00");
  const [allDay, setAllDay] = useState(event.all_day);
  const [color, setColor] = useState(event.color);
  const [remindEnabled, setRemindEnabled] = useState(event.remind_minutes !== null);
  const [remindMinutes, setRemindMinutes] = useState(Math.abs(event.remind_minutes || 15));
  const [remindHour, setRemindHour] = useState(9);
  const [saving, setSaving] = useState(false);

  const colors = ["#3B82F6", "#22C55E", "#F59E0B", "#EF4444", "#8B5CF6"];
  const remindOptions = [
    { value: 5, label: t("calendar.remindOptions.5") },
    { value: 10, label: t("calendar.remindOptions.10") },
    { value: 15, label: t("calendar.remindOptions.15") },
    { value: 30, label: t("calendar.remindOptions.30") },
    { value: 60, label: t("calendar.remindOptions.60") },
    { value: 120, label: t("calendar.remindOptions.120") },
  ];
  const hourOptions = Array.from({ length: 24 }, (_, i) => i);

  async function save() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      let finalRemindMinutes: number | null = null;
      if (remindEnabled) {
        if (allDay) {
          finalRemindMinutes = -(remindHour * 60);
        } else {
          finalRemindMinutes = remindMinutes;
        }
      }

      await api.updateEvent({
        id: event.id,
        title,
        description: description || undefined,
        startTime: allDay ? `${date}T00:00:00` : `${date}T${startTime}:00`,
        endTime: allDay ? undefined : `${date}T${endTime}:00`,
        allDay,
        color,
        remindMinutes: finalRemindMinutes,
      });
      onSaved();
    } catch (e: any) {
      alert(t("saveError") + ": " + (e?.message || String(e)));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center backdrop-anim"
      style={{ backgroundColor: "rgba(15, 23, 42, 0.4)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-[460px] rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-soft-lg animate-fade-in-scale">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
          <h2 className="text-[14px] font-semibold flex items-center gap-2">
            <CalIcon size={14} />
            {t("calendar.editEvent")}
          </h2>
          <button onClick={onClose} className="btn btn-ghost btn-icon">
            <X size={14} />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("calendar.eventTitle")}
            className="input"
            autoFocus
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("calendar.eventDesc")}
            rows={2}
            className="input h-auto py-2"
          />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="input"
          />
          <label className="flex items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="rounded"
            />
            {t("calendar.allDay")}
          </label>
          {!allDay && (
            <div className="grid grid-cols-2 gap-3">
              <TimePicker
                value={startTime}
                onChange={setStartTime}
                label={t("calendar.startTime")}
              />
              <TimePicker
                value={endTime}
                onChange={setEndTime}
                label={t("calendar.endTime")}
              />
            </div>
          )}
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-[13px] cursor-pointer">
              <button
                onClick={() => setRemindEnabled(!remindEnabled)}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] transition-colors",
                  remindEnabled
                    ? "bg-accent-100 text-accent-600"
                    : "bg-[var(--bg-secondary)] text-[var(--text-tertiary)]"
                )}
              >
                {remindEnabled ? <Bell size={12} /> : <BellOff size={12} />}
                {remindEnabled ? t("calendar.remind") : t("calendar.noRemind")}
              </button>
            </label>
            {remindEnabled && (
              <div className="flex items-center gap-2 flex-1">
                {allDay ? (
                  <>
                    <span className="text-[12px] text-[var(--text-secondary)]">{t("calendar.today")}</span>
                    <select
                      value={remindHour}
                      onChange={(e) => setRemindHour(Number(e.target.value))}
                      className="input text-[13px] py-1.5 w-20"
                    >
                      {hourOptions.map((h) => (
                        <option key={h} value={h}>
                          {String(h).padStart(2, "0")}:00
                        </option>
                      ))}
                    </select>
                    <span className="text-[12px] text-[var(--text-secondary)]">{t("calendar.remind")}</span>
                  </>
                ) : (
                  <select
                    value={remindMinutes}
                    onChange={(e) => setRemindMinutes(Number(e.target.value))}
                    className="input text-[13px] py-1.5 flex-1"
                  >
                    {remindOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </div>
          <div>
            <div className="text-[11px] text-[var(--text-secondary)] mb-2">
              {t("calendar.color")}
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
                />
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
          <button onClick={onClose} className="btn btn-ghost">
            {t("calendar.cancel")}
          </button>
          <button onClick={save} className="btn btn-primary" disabled={saving}>
            {saving ? t("calendar.saving") : t("calendar.save")}
          </button>
        </div>
      </div>
    </div>
  );
}