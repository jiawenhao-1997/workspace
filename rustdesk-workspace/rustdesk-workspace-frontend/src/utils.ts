import i18n from "./i18n";

export function formatRelativeTime(dateStr: string): string {
  const locale = i18n.language || "zh-CN";
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return locale === "en-US" ? "just now" : "刚刚";
  if (minutes < 60) return locale === "en-US"
    ? `${minutes} minute${minutes > 1 ? "s" : ""} ago`
    : `${minutes} 分钟前`;
  if (hours < 24) return locale === "en-US"
    ? `${hours} hour${hours > 1 ? "s" : ""} ago`
    : `${hours} 小时前`;
  if (days < 7) return locale === "en-US"
    ? `${days} day${days > 1 ? "s" : ""} ago`
    : `${days} 天前`;
  return date.toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
  });
}

export function formatTime(dateStr: string): string {
  const locale = i18n.language || "zh-CN";
  const date = new Date(dateStr);
  return date.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(dateStr: string): string {
  const locale = i18n.language || "zh-CN";
  const date = new Date(dateStr);
  return date.toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function formatDateShort(dateStr: string): string {
  const locale = i18n.language || "zh-CN";
  const date = new Date(dateStr);
  return date.toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
  });
}

export function isToday(dateStr: string): boolean {
  const date = new Date(dateStr);
  const today = new Date();
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

export function isOverdue(dateStr: string): boolean {
  const date = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return date.getTime() < now.getTime();
}

export function getGreeting(): string {
  const locale = i18n.language || "zh-CN";
  const hour = new Date().getHours();
  if (locale === "en-US") {
    if (hour < 6) return "Good night";
    if (hour < 11) return "Good morning";
    if (hour < 13) return "Good noon";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  }
  if (hour < 6) return "夜深了";
  if (hour < 11) return "早上好";
  if (hour < 13) return "中午好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

export function getWeekDay(): string {
  const locale = i18n.language || "zh-CN";
  return new Date().toLocaleDateString(locale, { weekday: "long" });
}

export function getFullDate(): string {
  const locale = i18n.language || "zh-CN";
  return new Date().toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}

export function parseTags(tags: string | null | undefined): string[] {
  if (!tags) return [];
  return tags.split(",").map((t) => t.trim()).filter(Boolean);
}

export function cn(...args: (string | false | null | undefined)[]): string {
  return args.filter(Boolean).join(" ");
}

// 颜色调整函数，用于生成渐变色
export function adjustColor(hex: string, amount: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amount));
  const b = Math.min(255, Math.max(0, (num & 0x0000FF) + amount));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}