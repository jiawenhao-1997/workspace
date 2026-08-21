export interface Project {
  id: string;
  name: string;
  description: string | null;
  color: string;
  status: string;
  progress: number;
  progress_mode: "manual" | "auto" | null; // P1-5: 进度模式
  owner: string | null;
  start_date: string | null;
  target_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  project_id: string | null;
  title: string;
  description: string | null;
  priority: "urgent" | "high" | "medium" | "low";
  status: "todo" | "in_progress" | "done" | "cancelled";
  due_date: string | null;
  tags: string | null;
  attachments: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  tags: string | null;
  is_pinned: boolean;
  is_archived: boolean;
  file_path: string | null;
  word_count: number;
  created_at: string;
  updated_at: string;
}

export interface Activity {
  id: string;
  type: string;
  title: string;
  subtitle: string | null;
  entity_id: string | null;
  entity_type: string | null;
  created_at: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string | null;
  all_day: boolean;
  color: string;
  remind_minutes: number | null; // null = 不提醒，数字 = 提前多少分钟提醒
  created_at: string;
}

export interface DashboardData {
  overdue_tasks: Task[];
  today_tasks: Task[];
  unscheduled_tasks: Task[];
  active_projects: Project[];
  recent_activities: Activity[];
  today_progress: number;
  today_done: number;
  today_pending: number;
}

export interface KnowledgeBase {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
  item_count: number;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeItem {
  id: string;
  source: string;
  source_type: string;
  title: string;
  content: string | null;
  url: string | null;
  tags: string | null;
  summary: string | null;
  file_path: string | null;
  base_ids: string[];
  created_at: string;
}

export type Theme = "light" | "dark" | "system";

export type View =
  | "dashboard"
  | "projects"
  | "tasks"
  | "notes"
  | "knowledge"
  | "calendar"
  | "analytics"
  | "ai"
  | "settings"
  | "trash";

export interface TrashItem {
  id: string;
  /** task | note | project | knowledge */
  item_type: string;
  title: string;
  deleted_at: string;
}

export interface AiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  time: string;
  // 如果是需要确认的消息，带上确认类型
  confirmType?: "web_search";
  // 确认时需要回传的原始问题
  pendingQuery?: string;
}

/** 上传进度事件（后端 emit 推送） */
export interface UploadProgress {
  phase: "extract" | "embedding" | "save" | "done" | "error";
  current: number;
  total: number;
  elapsed_secs: number;
  eta_secs: number;
  message: string;
  failed: boolean;
  /** done 阶段携带完整记录，前端可直接使用 */
  item: KnowledgeItem | null;
}
