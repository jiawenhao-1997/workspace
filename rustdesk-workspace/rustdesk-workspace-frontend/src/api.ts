import { invoke } from "@tauri-apps/api/core";
import type {
  Project,
  Task,
  Note,
  Activity,
  CalendarEvent,
  DashboardData,
  KnowledgeItem,
} from "./types";

export const api = {
  // 项目
  listProjects: () => invoke<Project[]>("list_projects"),
  createProject: (params: {
    name: string;
    description?: string;
    color?: string;
    owner?: string;
  }) => invoke<Project>("create_project", params),
  updateProject: (params: {
    id: string;
    name?: string;
    description?: string;
    color?: string;
    status?: string;
    progress?: number;
    target_date?: string;
  }) => invoke<void>("update_project", params),
  deleteProject: (id: string) => invoke<void>("delete_project", { id }),

  // 任务
  listTasks: (params?: { project_id?: string; status?: string }) =>
    invoke<Task[]>("list_tasks", params ?? {}),
  createTask: (params: {
    title: string;
    project_id?: string;
    description?: string;
    priority?: string;
    due_date?: string;
    tags?: string[];
  }) => invoke<Task>("create_task", params),
  updateTask: (params: {
    id: string;
    title?: string;
    description?: string;
    priority?: string;
    status?: string;
    due_date?: string;
    tags?: string[];
    sort_order?: number;
  }) => invoke<void>("update_task", params),
  toggleTask: (id: string) => invoke<void>("toggle_task", { id }),
  deleteTask: (id: string) => invoke<void>("delete_task", { id }),

  // 笔记
  listNotes: (includeArchived = false) =>
    invoke<Note[]>("list_notes", { includeArchived }),
  getNote: (id: string) => invoke<Note>("get_note", { id }),
  createNote: (params: {
    title: string;
    content?: string;
    tags?: string[];
  }) => invoke<Note>("create_note", params),
  updateNote: (params: {
    id: string;
    title?: string;
    content?: string;
    tags?: string[];
    is_pinned?: boolean;
  }) => invoke<void>("update_note", params),
  deleteNote: (id: string) => invoke<void>("delete_note", { id }),
  searchNotes: (query: string) =>
    invoke<Note[]>("search_notes", { query }),
  getNoteLinks: (noteId: string) =>
    invoke<string[]>("get_note_links", { noteId }),

  // 活动
  listActivities: (limit = 20) =>
    invoke<Activity[]>("list_activities", { limit }),

  // 日历
  listEvents: (params?: { start?: string; end?: string }) =>
    invoke<CalendarEvent[]>("list_events", params ?? {}),
  createEvent: (params: {
    title: string;
    description?: string;
    startTime: string;
    endTime?: string;
    allDay?: boolean;
    color?: string;
  }) => invoke<CalendarEvent>("create_event", params),
  deleteEvent: (id: string) => invoke<void>("delete_event", { id }),

  // Dashboard
  getDashboard: () => invoke<DashboardData>("get_dashboard"),

  // 设置
  getSetting: (key: string) =>
    invoke<string | null>("get_setting", { key }),
  setSetting: (key: string, value: string) =>
    invoke<void>("set_setting", { key, value }),
  getAllSettings: () =>
    invoke<[string, string][]>("get_all_settings"),

  // Quick Capture
  quickCapture: (input: string, captureType?: string) =>
    invoke<string>("quick_capture", {
      input,
      captureType: captureType ?? null,
    }),

  // AI
  aiAssistant: (prompt: string, contextType?: string) =>
    invoke<string>("ai_assistant", {
      prompt,
      contextType: contextType ?? null,
    }),

  // Export
  exportData: () => invoke<string>("export_data"),
};