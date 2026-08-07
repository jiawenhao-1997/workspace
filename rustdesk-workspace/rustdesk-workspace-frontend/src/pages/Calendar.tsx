import { useEffect, useState } from "react";
import { api } from "../api";
import type { CalendarEvent } from "../types";
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  X,
  Clock,
  Calendar as CalIcon,
} from "lucide-react";
import { cn } from "../utils";

export function CalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showCreate, setShowCreate] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

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

  const monthNames = [
    "一月", "二月", "三月", "四月", "五月", "六月",
    "七月", "八月", "九月", "十月", "十一月", "十二月",
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-[var(--border)] bg-[var(--bg-primary)] px-8 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="h-display">日历</h1>
            <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
              {events.length} 个事件
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
              今天
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
              新建事件
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-[var(--bg-secondary)] p-8">
        <div className="mx-auto max-w-[1100px]">
          <div className="mb-4">
            <h2 className="h-section">
              {year} 年 {monthNames[month]}
            </h2>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] p-4">
            <div className="grid grid-cols-7 mb-2">
              {["周一", "周二", "周三", "周四", "周五", "周六", "周日"].map((d) => (
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
                  <button
                    key={idx}
                    onClick={() => setSelectedDay(day)}
                    className={cn(
                      "aspect-square rounded-lg border p-1.5 text-left transition-colors overflow-hidden",
                      isCurrentDay
                        ? "border-accent-500 bg-accent-50/40"
                        : isSelected
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
                          className="truncate rounded px-1 py-0.5 text-[10px] text-white"
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
                  </button>
                );
              })}
            </div>
          </div>

          {/* 选中日的详情 */}
          {selectedDay !== null && (
            <div className="mt-6">
              <h3 className="h-section mb-3">
                {month + 1} 月 {selectedDay} 日
              </h3>
              <div className="space-y-2">
                {eventsForDay(selectedDay).length === 0 ? (
                  <div className="text-center py-8 text-[var(--text-tertiary)] text-[13px] rounded-xl border border-dashed border-[var(--border)]">
                    这一天没有事件
                  </div>
                ) : (
                  eventsForDay(selectedDay).map((e) => (
                    <div
                      key={e.id}
                      className="rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-4"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <div
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: e.color }}
                            />
                            <span className="text-[14px] font-semibold">
                              {e.title}
                            </span>
                          </div>
                          <div className="text-[12px] text-[var(--text-secondary)] flex items-center gap-3">
                            <span className="flex items-center gap-1">
                              <Clock size={11} />
                              {e.all_day
                                ? "全天"
                                : e.start_time.substring(11, 16) +
                                  (e.end_time ? ` - ${e.end_time.substring(11, 16)}` : "")}
                            </span>
                          </div>
                          {e.description && (
                            <div className="mt-2 text-[12px] text-[var(--text-secondary)]">
                              {e.description}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={async () => {
                            await api.deleteEvent(e.id);
                            await load();
                          }}
                          className="btn btn-danger btn-icon"
                          aria-label="删除"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

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
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(new Date().toISOString().substring(0, 10));
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [allDay, setAllDay] = useState(false);
  const [color, setColor] = useState("#3B82F6");

  const colors = ["#3B82F6", "#22C55E", "#F59E0B", "#EF4444", "#8B5CF6"];

  async function create() {
    if (!title.trim()) return;
    try {
      await api.createEvent({
        title,
        description: description || undefined,
        startTime: allDay ? `${date}T00:00:00` : `${date}T${startTime}:00`,
        endTime: allDay ? undefined : `${date}T${endTime}:00`,
        allDay,
        color,
      });
      onCreated();
    } catch (e: any) {
      alert("创建失败: " + (e?.message || String(e)));
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
            新建事件
          </h2>
          <button onClick={onClose} className="btn btn-ghost btn-icon">
            <X size={14} />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="事件标题"
            className="input"
            autoFocus
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="描述（可选）"
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
            全天
          </label>
          {!allDay && (
            <div className="grid grid-cols-2 gap-3">
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="input"
              />
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="input"
              />
            </div>
          )}
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
                />
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
          <button onClick={onClose} className="btn btn-ghost">
            取消
          </button>
          <button onClick={create} className="btn btn-primary">
            创建
          </button>
        </div>
      </div>
    </div>
  );
}