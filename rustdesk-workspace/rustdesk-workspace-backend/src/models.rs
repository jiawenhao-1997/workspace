use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub color: String,
    pub status: String,
    pub progress: i32,
    pub owner: Option<String>,
    pub start_date: Option<String>,
    pub target_date: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub project_id: Option<String>,
    pub title: String,
    pub description: Option<String>,
    pub priority: String,
    pub status: String,
    pub due_date: Option<String>,
    pub tags: Option<String>,
    pub attachments: Option<String>,
    pub sort_order: i32,
    pub created_at: String,
    pub updated_at: String,
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Note {
    pub id: String,
    pub title: String,
    pub content: String,
    pub tags: Option<String>,
    pub is_pinned: bool,
    pub is_archived: bool,
    pub file_path: Option<String>,
    pub word_count: i32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Activity {
    pub id: String,
    #[serde(rename = "type")]
    pub activity_type: String,
    pub title: String,
    pub subtitle: Option<String>,
    pub entity_id: Option<String>,
    pub entity_type: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Event {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub start_time: String,
    pub end_time: Option<String>,
    pub all_day: bool,
    pub color: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnowledgeItem {
    pub id: String,
    pub source: String,
    pub source_type: String,
    pub title: String,
    pub content: Option<String>,
    pub url: Option<String>,
    pub tags: Option<String>,
    pub summary: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DashboardData {
    pub today_tasks: Vec<Task>,
    pub active_projects: Vec<Project>,
    pub recent_activities: Vec<Activity>,
    pub today_progress: i32,
    pub total_completed: i32,
    pub total_pending: i32,
}