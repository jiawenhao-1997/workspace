import { invoke, Channel } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type {
  Project,
  Task,
  Note,
  Activity,
  CalendarEvent,
  DashboardData,
  KnowledgeItem,
  KnowledgeBase,
  TrashItem,
  UploadProgress,
} from "./types";
import i18n from "./i18n";
import type { Locale } from "./i18n/types";

// 获取当前语言设置
function getCurrentLanguage(): Locale {
  return (i18n.language as Locale) || "zh-CN";
}

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
    progress_mode?: "manual" | "auto"; // P1-5
    target_date?: string;
  }) =>
    invoke<void>("update_project", {
      id: params.id,
      name: params.name,
      description: params.description,
      color: params.color,
      status: params.status,
      progress: params.progress,
      progressMode: params.progress_mode,
      targetDate: params.target_date,
    }),
  deleteProject: (id: string) => invoke<void>("delete_project", { id }),

  // 任务
  listTasks: (params?: { project_id?: string; status?: string }) =>
    invoke<Task[]>("list_tasks", {
      projectId: params?.project_id,
      status: params?.status,
    }),
  createTask: (params: {
    title: string;
    project_id?: string;
    description?: string;
    priority?: string;
    due_date?: string;
    tags?: string[];
  }) =>
    invoke<Task>("create_task", {
      title: params.title,
      projectId: params.project_id,
      description: params.description,
      priority: params.priority,
      dueDate: params.due_date,
      tags: params.tags,
    }),
  updateTask: (params: {
    id: string;
    title?: string;
    description?: string;
    priority?: string;
    status?: string;
    due_date?: string;
    tags?: string[];
    sort_order?: number;
  }) =>
    invoke<void>("update_task", {
      id: params.id,
      title: params.title,
      description: params.description,
      priority: params.priority,
      status: params.status,
      dueDate: params.due_date,
      tags: params.tags,
      sortOrder: params.sort_order,
    }),
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
  }) =>
    invoke<void>("update_note", {
      id: params.id,
      title: params.title,
      content: params.content,
      tags: params.tags,
      isPinned: params.is_pinned,
    }),
  deleteNote: (id: string) => invoke<void>("delete_note", { id }),
  searchNotes: (query: string) =>
    invoke<Note[]>("search_notes", { query }),
  // P1-1: FTS5 全文搜索（毫秒级响应，含高亮片段）
  searchNotesFts: (query: string, limit = 50) =>
    invoke<Array<Note & { rank: number; snippet: string }>>(
      "search_notes_fts",
      { query, limit }
    ),
  searchKnowledgeFts: (query: string, limit = 50) =>
    invoke<Array<KnowledgeItem & { rank: number; snippet: string }>>(
      "search_knowledge_fts",
      { query, limit }
    ),
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
    remindMinutes?: number | null;
  }) => invoke<CalendarEvent>("create_event", params),
  deleteEvent: (id: string) => invoke<void>("delete_event", { id }),
  updateEvent: (params: {
    id: string;
    title?: string;
    description?: string;
    startTime?: string;
    endTime?: string;
    allDay?: boolean;
    color?: string;
    remindMinutes?: number | null;
  }) => invoke<CalendarEvent>("update_event", {
    id: params.id,
    title: params.title,
    description: params.description,
    startTime: params.startTime,
    endTime: params.endTime,
    allDay: params.allDay,
    color: params.color,
    remindMinutes: params.remindMinutes,
  }),

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
  aiAssistant: (
    prompt: string,
    contextType?: string,
    knowledgeBaseId?: string | null,
    history?: { role: string; content: string }[],
    onDelta?: (delta: string) => void,
    requestId?: string
  ) => {
    // 流式输出：后端通过 Channel 逐段推送增量文本
    const channel = new Channel<string>();
    if (onDelta) channel.onmessage = onDelta;
    return invoke<string>("ai_assistant", {
      prompt,
      contextType: contextType ?? null,
      knowledgeBaseId: knowledgeBaseId ?? null,
      history: history && history.length > 0 ? history : null,
      channel,
      requestId: requestId ?? null,
      language: getCurrentLanguage(),
    });
  },
  // 中断进行中的 AI 请求（保留已生成内容）
  cancelAiRequest: (requestId: string) =>
    invoke<void>("cancel_ai_request", { requestId }),

  // 知识库文件
  listKnowledgeItems: (baseId?: string | null) =>
    invoke<KnowledgeItem[]>("list_knowledge_items", { baseId: baseId ?? null }),
  deleteKnowledgeItem: (id: string) => invoke<void>("delete_knowledge_item", { id }),
  uploadKnowledgeFile: (filePath: string, baseIds?: string[] | null) =>
    invoke<KnowledgeItem>("upload_knowledge_file", {
      filePath,
      baseIds: baseIds ?? null,
    }),
  queryKnowledgeBase: (query: string, fileHint?: string, baseId?: string) =>
    invoke<string>("query_knowledge_base", {
      query,
      fileHint: fileHint ?? null,
      baseId: baseId ?? null,
    }),

  // 知识库（容器）
  listKnowledgeBases: () => invoke<KnowledgeBase[]>("list_knowledge_bases"),
  createKnowledgeBase: (params: {
    name: string;
    description?: string | null;
    icon?: string | null;
  }) =>
    invoke<KnowledgeBase>("create_knowledge_base", {
      name: params.name,
      description: params.description ?? null,
      icon: params.icon ?? null,
    }),
  updateKnowledgeBase: (params: {
    id: string;
    name?: string | null;
    description?: string | null;
    icon?: string | null;
  }) =>
    invoke<void>("update_knowledge_base", {
      id: params.id,
      name: params.name ?? null,
      description: params.description ?? null,
      icon: params.icon ?? null,
    }),
  deleteKnowledgeBase: (id: string, action: "move_to_default" | "delete_all") =>
    invoke<number>("delete_knowledge_base", { id, action }),
  addItemToBases: (itemId: string, baseIds: string[]) =>
    invoke<void>("add_item_to_bases", { itemId, baseIds }),
  removeItemFromBase: (itemId: string, baseId: string) =>
    invoke<void>("remove_item_from_base", { itemId, baseId }),

  // 选择文件并上传到知识库
  async selectAndUploadKnowledgeFile(
    baseIds?: string[]
  ): Promise<KnowledgeItem | null> {
    const selected = await open({
      multiple: false,
      filters: [{
        name: "支持的文档",
        extensions: ["pdf", "docx", "xlsx", "txt", "md", "csv"]
      }]
    });
    if (selected && typeof selected === "string") {
      return this.uploadKnowledgeFile(selected, baseIds);
    }
    return null;
  },

  // 全量备份 / 恢复（JSON 文件）
  exportBackup: (filePath: string) => invoke<string>("export_backup", { filePath }),
  importBackup: (filePath: string) => invoke<string>("import_backup", { filePath }),
  // 回收站
  listTrash: () => invoke<TrashItem[]>("list_trash"),
  restoreTrashItem: (itemType: string, id: string) =>
    invoke<void>("restore_trash_item", { itemType: itemType, id }),
  purgeTrashItem: (itemType: string, id: string) =>
    invoke<void>("purge_trash_item", { itemType: itemType, id }),
  emptyTrash: () => invoke<string>("empty_trash"),

  // Export
};
