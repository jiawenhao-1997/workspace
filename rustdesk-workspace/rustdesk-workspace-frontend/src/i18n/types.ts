// i18n key 类型定义（用于编译期校验）
export type Namespace =
  | "common"
  | "sidebar"
  | "nav"
  | "dashboard"
  | "tasks"
  | "projects"
  | "notes"
  | "calendar"
  | "knowledge"
  | "analytics"
  | "trash"
  | "settings"
  | "ai"
  | "aiSettings"
  | "timePicker"
  | "utils";

export type Locale = "zh-CN" | "en-US";

export const SUPPORTED_LOCALES: Locale[] = ["zh-CN", "en-US"];

export function isSupportedLocale(locale: string): locale is Locale {
  return SUPPORTED_LOCALES.includes(locale as Locale);
}

export function getLocaleFromBrowser(): Locale {
  const browserLang = navigator.language;
  if (browserLang.startsWith("en")) return "en-US";
  return "zh-CN";
}
