import { useState, useRef, useEffect } from "react";
import { Clock } from "lucide-react";
import { cn } from "../utils";

interface TimePickerProps {
  value: string; // "HH:MM" format
  onChange: (time: string) => void;
  label?: string;
  minuteStep?: number; // 步长，默认1分钟，可设为5/10/15/30
}

export function TimePicker({ value, onChange, label, minuteStep = 1 }: TimePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hours, minutes] = value.split(":").map(Number);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 生成选项
  const hourOptions = Array.from({ length: 24 }, (_, i) => i);
  const minuteOptions = minuteStep === 1
    ? Array.from({ length: 60 }, (_, i) => i)
    : Array.from({ length: 60 / minuteStep }, (_, i) => i * minuteStep);

  // 点击外部关闭
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  function selectHour(h: number) {
    onChange(`${String(h).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`);
  }

  function selectMinute(m: number) {
    onChange(`${String(hours).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }

  function scrollToActive(el: HTMLElement | null, activeIndex: number) {
    if (el) {
      const itemHeight = 36; // 每个选项的高度
      el.scrollTop = activeIndex * itemHeight - el.clientHeight / 2 + itemHeight / 2;
    }
  }

  const hourRef = useRef<HTMLDivElement>(null);
  const minuteRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollToActive(hourRef.current, hours);
    scrollToActive(minuteRef.current, minuteOptions.indexOf(minutes));
  }, [isOpen]);

  return (
    <div className="flex flex-col gap-1" ref={dropdownRef}>
      {label && (
        <label className="text-[11px] text-[var(--text-secondary)]">{label}</label>
      )}
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="input flex items-center gap-2 text-[13px] cursor-pointer"
        >
          <Clock size={13} className="text-[var(--text-tertiary)]" />
          <span>{value}</span>
        </button>

        {isOpen && (
          <div className="absolute top-full left-0 mt-1 z-50 bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl shadow-soft-lg p-3 animate-fade-in-scale">
            <div className="flex items-center gap-2">
              {/* 小时 */}
              <div
                ref={hourRef}
                className="w-[72px] h-[180px] overflow-y-auto scrollbar-hide border-r border-[var(--border)]"
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
              >
                {hourOptions.map((h) => (
                  <div
                    key={h}
                    onClick={() => selectHour(h)}
                    className={cn(
                      "h-9 flex items-center justify-center text-[13px] cursor-pointer rounded-md mx-1 transition-colors",
                      h === hours
                        ? "bg-accent-100 text-accent-600 font-semibold"
                        : "hover:bg-[var(--bg-secondary)]"
                    )}
                  >
                    {String(h).padStart(2, "0")}
                  </div>
                ))}
              </div>

              <span className="text-[18px] text-[var(--text-tertiary)] font-light">:</span>

              {/* 分钟 */}
              <div
                ref={minuteRef}
                className="w-[72px] h-[180px] overflow-y-auto scrollbar-hide"
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
              >
                {minuteOptions.map((m) => (
                  <div
                    key={m}
                    onClick={() => selectMinute(m)}
                    className={cn(
                      "h-9 flex items-center justify-center text-[13px] cursor-pointer rounded-md mx-1 transition-colors",
                      m === minutes
                        ? "bg-accent-100 text-accent-600 font-semibold"
                        : "hover:bg-[var(--bg-secondary)]"
                    )}
                  >
                    {String(m).padStart(2, "0")}
                  </div>
                ))}
              </div>
            </div>

            {/* 快捷按钮 */}
            <div className="flex justify-center gap-2 mt-2 pt-2 border-t border-[var(--border)]">
              {["00:00", "09:00", "12:00", "18:00", "23:59"].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { onChange(t); setIsOpen(false); }}
                  className="px-2 py-1 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] rounded transition-colors"
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
