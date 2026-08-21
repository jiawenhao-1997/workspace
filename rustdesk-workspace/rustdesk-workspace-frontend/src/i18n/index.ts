import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { api } from "../api";
import { SUPPORTED_LOCALES, isSupportedLocale, getLocaleFromBrowser, type Locale } from "./types";
import zhCN from "./locales/zh-CN";
import enUS from "./locales/en-US";

const resources = {
  "zh-CN": { translation: zhCN },
  "en-US": { translation: enUS },
};

export { SUPPORTED_LOCALES, type Locale };

/**
 * 初始化 i18next
 * - 同步初始化（suspense: false），避免加载闪烁
 * - saveMissing: true 开发期控制台报缺失 key
 */
export function initI18n(): Promise<void> {
  return new Promise((resolve) => {
    i18n.use(initReactI18next).init(
      {
        resources,
        lng: "zh-CN", // 默认语言
        fallbackLng: "zh-CN",
        interpolation: {
          escapeValue: false,
        },
        saveMissing: false, // 生产环境关闭，开发期可开启
        missingKeyHandler: (lng, ns, key) => {
          console.warn(`[i18n] Missing key: ${key} (lng: ${lng}, ns: ${ns})`);
        },
      },
      () => {
        // 初始化后加载用户语言偏好
        loadLanguagePreference().then(() => {
          resolve();
        });
      }
    );
  });
}

/**
 * 从后端加载用户语言偏好
 */
async function loadLanguagePreference(): Promise<void> {
  try {
    const savedLang = await api.getSetting("language");
    if (savedLang && isSupportedLocale(savedLang)) {
      await changeLanguage(savedLang);
    } else {
      // 无设置时，用浏览器语言
      const browserLang = getLocaleFromBrowser();
      if (browserLang !== i18n.language) {
        await changeLanguage(browserLang);
      }
    }
  } catch (e) {
    console.error("Failed to load language preference:", e);
  }
}

/**
 * 切换语言
 * - 更新 i18n 实例
 * - 持久化到后端
 */
export async function changeLanguage(locale: Locale): Promise<void> {
  await i18n.changeLanguage(locale);
  document.documentElement.lang = locale;
  // 持久化
  api.setSetting("language", locale).catch(() => {
    console.error("Failed to save language preference");
  });
}

/**
 * 获取当前语言
 */
export function getCurrentLanguage(): Locale {
  const lang = i18n.language;
  return isSupportedLocale(lang) ? lang : "zh-CN";
}

export default i18n;
