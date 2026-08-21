import { useEffect } from "react";
import { initTheme, loadUserSettings, useAppStore } from "./store";
import { initI18n } from "./i18n";
import { Sidebar } from "./components/Sidebar";
import { MainArea } from "./components/MainArea";
import { CommandPalette } from "./components/CommandPalette";
import { AiPanel } from "./components/AiPanel";

export default function App() {
  const setView = useAppStore((s) => s.setView);
  const commandPaletteOpen = useAppStore((s) => s.commandPaletteOpen);
  const setCommandPaletteOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const aiPanelOpen = useAppStore((s) => s.aiPanelOpen);
  const setAiPanelOpen = useAppStore((s) => s.setAiPanelOpen);

  useEffect(() => {
    initI18n().then(() => {
      initTheme();
      loadUserSettings();
    });
  }, []);

  // 全局快捷键
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const ctrl = e.ctrlKey || e.metaKey;

      // Ctrl+Space — 命令面板 / AI
      if (ctrl && e.code === "Space") {
        e.preventDefault();
        if (e.shiftKey) {
          setAiPanelOpen(!aiPanelOpen);
        } else {
          setCommandPaletteOpen(!commandPaletteOpen);
        }
      }

      // Ctrl+K — 命令面板（备用）
      if (ctrl && e.key === "k") {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }

      // Ctrl+N — 新建任务
      if (ctrl && e.key === "n" && !e.shiftKey) {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }

      // Esc — 关闭面板
      if (e.key === "Escape") {
        if (commandPaletteOpen) setCommandPaletteOpen(false);
        if (aiPanelOpen) setAiPanelOpen(false);
      }

      // 数字键快速导航 1-8
      if (ctrl && !e.shiftKey && !e.altKey) {
        const map: Record<string, () => void> = {
          "1": () => setView("dashboard"),
          "2": () => setView("projects"),
          "3": () => setView("tasks"),
          "4": () => setView("notes"),
          "5": () => setView("knowledge"),
          "6": () => setView("calendar"),
          "7": () => setView("analytics"),
          "8": () => setView("settings"),
        };
        if (map[e.key]) {
          e.preventDefault();
          map[e.key]();
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [commandPaletteOpen, aiPanelOpen, setCommandPaletteOpen, setAiPanelOpen, setView]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--bg-secondary)] text-[var(--text-primary)]">
      <Sidebar />
      <MainArea />
      {commandPaletteOpen && <CommandPalette />}
      {aiPanelOpen && <AiPanel />}
    </div>
  );
}