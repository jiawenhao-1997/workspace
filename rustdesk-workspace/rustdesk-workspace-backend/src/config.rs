use std::path::PathBuf;
use dirs::data_dir;

pub fn get_workspace_dir() -> PathBuf {
    let mut path = data_dir().unwrap_or_else(|| PathBuf::from("."));
    path.push("RustDeskWorkspace");
    if !path.exists() {
        std::fs::create_dir_all(&path).ok();
    }
    path
}

pub fn get_db_path() -> PathBuf {
    let mut path = get_workspace_dir();
    path.push("workspace.db");
    path
}

pub fn get_notes_dir() -> PathBuf {
    let mut path = get_workspace_dir();
    path.push("notes");
    if !path.exists() {
        std::fs::create_dir_all(&path).ok();
    }
    path
}

pub fn get_attachments_dir() -> PathBuf {
    let mut path = get_workspace_dir();
    path.push("attachments");
    if !path.exists() {
        std::fs::create_dir_all(&path).ok();
    }
    path
}

pub fn get_config_path() -> PathBuf {
    let mut path = get_workspace_dir();
    path.push("config.json");
    path
}