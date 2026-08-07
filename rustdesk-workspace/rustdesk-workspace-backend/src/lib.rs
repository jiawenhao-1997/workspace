// Prevents additional console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod config;
mod database;
mod models;
mod commands;

use database::DbState;
use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_shortcuts(["CmdOrCtrl+Space"])
                .unwrap()
                .with_handler(|app, _shortcut, event| {
                    if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                            let _ = window.emit("command-palette-toggle", ());
                        }
                    }
                })
                .build(),
        )
        .setup(|app| {
            let db_state = DbState::new().expect("Failed to initialize database");
            app.manage(db_state);

    // 启动后窗口淡入
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_projects,
            commands::create_project,
            commands::update_project,
            commands::delete_project,
            commands::list_tasks,
            commands::create_task,
            commands::update_task,
            commands::toggle_task,
            commands::delete_task,
            commands::list_notes,
            commands::get_note,
            commands::create_note,
            commands::update_note,
            commands::delete_note,
            commands::search_notes,
            commands::get_note_links,
            commands::list_activities,
            commands::list_events,
            commands::create_event,
            commands::delete_event,
            commands::get_dashboard,
            commands::get_setting,
            commands::set_setting,
            commands::get_all_settings,
            commands::quick_capture,
            commands::ai_assistant,
            commands::test_ai_connection,
            commands::fetch_ai_models,
            commands::export_data,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
