// Prevents additional console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod config;
mod database;
mod models;
mod commands;
mod knowledge;
mod knowledge_cmds;
mod web_search;
mod notifier;
mod secrets;
mod search;

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

            // 将数据库中遗留的明文凭据迁移至系统钥匙串（在交由状态管理前完成）
            if let Ok(conn) = db_state.conn.lock() {
                secrets::migrate_from_db(&conn);
            }

            app.manage(db_state);

            // 启动到期提醒通知轮询
            notifier::start(app.handle().clone());

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
            commands::search_notes_fts,
            commands::search_knowledge_fts,
            commands::get_note_links,
            commands::list_activities,
            commands::list_events,
            commands::create_event,
            commands::update_event,
            commands::delete_event,
            commands::get_dashboard,
            commands::get_setting,
            commands::set_setting,
            commands::get_all_settings,
            commands::quick_capture,
            commands::ai_assistant,
            commands::cancel_ai_request,
            commands::test_ai_connection,
            commands::fetch_ai_models,
            commands::export_backup,
            commands::import_backup,
            commands::list_trash,
            commands::restore_trash_item,
            commands::purge_trash_item,
            commands::empty_trash,
            knowledge_cmds::list_knowledge_items,
            knowledge_cmds::delete_knowledge_item,
            knowledge_cmds::upload_knowledge_file,
            knowledge_cmds::query_knowledge_base,
            knowledge_cmds::list_knowledge_bases,
            knowledge_cmds::create_knowledge_base,
            knowledge_cmds::update_knowledge_base,
            knowledge_cmds::delete_knowledge_base,
            knowledge_cmds::add_item_to_bases,
            knowledge_cmds::remove_item_from_base,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
