import { create } from "zustand";
import { api } from "./api";
import { changeLanguage, SUPPORTED_LOCALES, type Locale } from "./i18n";
import type { View, Theme } from "./types";

interface AppState {
  currentView: View;
  setView: (view: View) => void;

  theme: Theme;
  setTheme: (theme: Theme) => void;

  language: Locale;
  setLanguage: (language: Locale) => void;

  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;

  aiPanelOpen: boolean;
  setAiPanelOpen: (open: boolean) => void;

  user: { name: string; status: string; avatarColor: string };
  setUser: (user: { name: string; status: string; avatarColor?: string }) => void;

  appName: string;
  setAppName: (name: string) => void;

  status: string;
  setStatus: (status: string) => void;

  newTaskModalOpen: boolean;
  openNewTaskModal: () => void;
  closeNewTaskModal: () => void;

  newNoteModalOpen: boolean;
  openNewNoteModal: () => void;
  closeNewNoteModal: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  currentView: "dashboard",
  setView: (view) => set({ currentView: view }),

  theme: "system",
  setTheme: (theme) => {
    set({ theme });
    applyTheme(theme);
    api.setSetting("theme", theme).catch(() => {});
  },

  language: "zh-CN",
  setLanguage: async (language) => {
    set({ language });
    await changeLanguage(language);
  },

  sidebarCollapsed: false,
  toggleSidebar: () =>
    set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  commandPaletteOpen: false,
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

  aiPanelOpen: false,
  setAiPanelOpen: (open) => set({ aiPanelOpen: open }),

  user: { name: "用户", status: "专注中", avatarColor: "#3B82F6" },
  setUser: (user) => {
    const current = get().user;
    const newUser = {
      name: user.name ?? current.name,
      status: user.status ?? current.status,
      avatarColor: user.avatarColor ?? current.avatarColor,
    };
    set({ user: newUser });
    // 持久化保存
    api.setSetting("user_name", newUser.name).catch(() => {});
    api.setSetting("user_status", newUser.status).catch(() => {});
    api.setSetting("user_avatar_color", newUser.avatarColor).catch(() => {});
  },

  appName: "RustDesk Workspace",
  setAppName: (name) => {
    set({ appName: name });
    api.setSetting("app_name", name).catch(() => {});
    document.title = name;
  },

  status: "today",
  setStatus: (status) => set({ status }),

  newTaskModalOpen: false,
  openNewTaskModal: () => set({ newTaskModalOpen: true }),
  closeNewTaskModal: () => set({ newTaskModalOpen: false }),

  newNoteModalOpen: false,
  openNewNoteModal: () => set({ newNoteModalOpen: true }),
  closeNewNoteModal: () => set({ newNoteModalOpen: false }),
}));

export async function loadUserSettings() {
  try {
    const [name, status, avatarColor, appName, language] = await Promise.all([
      api.getSetting("user_name"),
      api.getSetting("user_status"),
      api.getSetting("user_avatar_color"),
      api.getSetting("app_name"),
      api.getSetting("language"),
    ]);
    const store = useAppStore.getState();
    if (name || status || avatarColor) {
      store.setUser({
        name: name ?? "用户",
        status: status ?? "专注中",
        avatarColor: avatarColor ?? "#3B82F6",
      });
    }
    if (appName) {
      store.setAppName(appName);
    }
    if (language && isSupportedLocale(language)) {
      store.setLanguage(language);
    }
  } catch (e) {
    console.error("Failed to load user settings:", e);
  }
}

function isSupportedLocale(locale: string): locale is Locale {
  return SUPPORTED_LOCALES.includes(locale as Locale);
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
  } else if (theme === "light") {
    root.classList.remove("dark");
  } else {
    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.classList.toggle("dark", dark);
  }
}

export function initTheme() {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", () => {
    const theme = useAppStore.getState().theme;
    if (theme === "system") applyTheme("system");
  });
  applyTheme(useAppStore.getState().theme);
}