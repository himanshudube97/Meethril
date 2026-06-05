mod remind_check;

use tauri::{AppHandle, Manager, WindowEvent};
use tauri_plugin_notification::NotificationExt;

#[tauri::command]
async fn show_notification(app: AppHandle, title: String, body: String) -> Result<(), String> {
  app
    .notification()
    .builder()
    .title(title)
    .body(body)
    .show()
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn set_badge(app: AppHandle, count: u32) -> Result<(), String> {
  // macOS-only. On other platforms this is a no-op so JS doesn't need to branch.
  #[cfg(target_os = "macos")]
  {
    let win = app
      .get_webview_window("main")
      .ok_or_else(|| "main window not found".to_string())?;
    return win
      .set_badge_count(Some(count as i64))
      .map_err(|e| e.to_string());
  }
  #[cfg(not(target_os = "macos"))]
  {
    let _ = (app, count);
    Ok(())
  }
}

#[tauri::command]
fn clear_badge(app: AppHandle) -> Result<(), String> {
  #[cfg(target_os = "macos")]
  {
    let win = app
      .get_webview_window("main")
      .ok_or_else(|| "main window not found".to_string())?;
    return win.set_badge_count(None).map_err(|e| e.to_string());
  }
  #[cfg(not(target_os = "macos"))]
  {
    let _ = app;
    Ok(())
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  // Headless short-circuit: scheduled reminder check without spinning up a window.
  if std::env::args().any(|a| a == "--remind-check") {
    crate::remind_check::run_remind_check();
    return;
  }

  tauri::Builder::default()
    .plugin(tauri_plugin_notification::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      show_notification,
      set_badge,
      clear_badge
    ])
    .on_window_event(|window, event| {
      if let WindowEvent::Focused(true) = event {
        #[cfg(target_os = "macos")]
        {
          let win = window.app_handle().get_webview_window("main");
          if let Some(w) = win {
            let _ = w.set_badge_count(None);
          }
        }
        #[cfg(not(target_os = "macos"))]
        let _ = window;
      }
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
