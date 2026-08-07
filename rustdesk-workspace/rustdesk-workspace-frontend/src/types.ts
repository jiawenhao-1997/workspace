export interface Project {
  id: string;
  name: string;
  description: string | null;
  color: string;
  status: string;
  progress: number;
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
  created_at: string;
}

export interface DashboardData {
  today_tasks: Task[];
  active_projects: Project[];
  recent_activities: Activity[];
  today_progress: number;
  total_completed: number;
  total_pending: number;
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
  | "settings";