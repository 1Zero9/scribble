//! Scribble desktop shell.
//!
//! The Rust side is kept deliberately small. It owns three things the web layer
//! cannot do for itself:
//!
//!   1. the system-tray icon and its menu,
//!   2. showing and hiding the deskpad window,
//!   3. making sure only one copy of Scribble is running.
//!
//! There is no shell execution, no HTTP client and no custom file-system
//! command: everything else the interface needs is provided by tightly scoped
//! official plugins, restricted further by `capabilities/default.json`.

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, WindowEvent,
};

/// Shows the deskpad if it is hidden, hides it if it is visible.
#[tauri::command]
fn toggle_deskpad(app: AppHandle) -> Result<(), String> {
    toggle(&app).map_err(|error| error.to_string())
}

/// Hides the deskpad and returns the user to whatever was underneath.
#[tauri::command]
fn hide_deskpad(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.hide().map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn toggle(app: &AppHandle) -> tauri::Result<()> {
    let Some(window) = app.get_webview_window("main") else {
        return Ok(());
    };
    if window.is_visible()? {
        window.hide()?;
    } else {
        window.show()?;
        window.unminimize()?;
        window.set_focus()?;
    }
    Ok(())
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show or hide Scribble", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Scribble", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;

    TrayIconBuilder::with_id("scribble-tray")
        .icon(app.default_window_icon().cloned().expect("bundled icon"))
        .tooltip("Scribble — capture first, organise later")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                let _ = toggle(app);
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            // A left click summons the deskpad; the menu stays on right click.
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let _ = toggle(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
                // Launching Scribble again simply summons the existing window.
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }))
            .plugin(tauri_plugin_global_shortcut::Builder::new().build());
    }

    builder
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![toggle_deskpad, hide_deskpad])
        .setup(|app| {
            build_tray(app.handle())?;
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the window hides the deskpad rather than quitting, so
            // Scribble stays ready in the tray. Quit is on the tray menu.
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Scribble");
}
