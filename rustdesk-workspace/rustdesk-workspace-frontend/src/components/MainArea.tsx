import { useAppStore } from "../store";
import { Dashboard } from "../pages/Dashboard";
import { Projects } from "../pages/Projects";
import { Tasks } from "../pages/Tasks";
import { Notes } from "../pages/Notes";
import { Knowledge } from "../pages/Knowledge";
import { CalendarPage } from "../pages/Calendar";
import { Analytics } from "../pages/Analytics";
import { AISettings } from "../pages/AISettings";
import { Settings } from "../pages/Settings";
import { Trash } from "../pages/Trash";

export function MainArea() {
  const view = useAppStore((s) => s.currentView);

  return (
    <main className="flex-1 overflow-hidden bg-[var(--bg-secondary)]">
      {view === "dashboard" && <Dashboard />}
      {view === "projects" && <Projects />}
      {view === "tasks" && <Tasks />}
      {view === "notes" && <Notes />}
      {view === "knowledge" && <Knowledge />}
      {view === "calendar" && <CalendarPage />}
      {view === "analytics" && <Analytics />}
      {view === "ai" && <AISettings />}
      {view === "settings" && <Settings />}
      {view === "trash" && <Trash />}
    </main>
  );
}