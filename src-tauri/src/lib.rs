mod files;
mod media;
mod screen;
mod system;

use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{
    AppHandle, Emitter, Manager, Monitor, PhysicalPosition, PhysicalSize, State, WebviewWindow,
};
use tauri_plugin_autostart::MacosLauncher;

/// Distance from the top of the window to the pill, in logical px (matches `TOP` in Island.tsx).
const TOP: f64 = 0.0;
/// Extra grab area around the pill so hover feels forgiving, in logical px.
const MARGIN: f64 = 10.0;
/// Window size in logical px: wide and tall enough for the expanded card.
const WIN_W: f64 = 520.0;
const WIN_H: f64 = 340.0;

/// Size of the interactive area in logical px, reported by the frontend.
struct HitArea(Mutex<(f64, f64)>);

/// 0 = primary monitor, n = n-th entry of the monitor list.
static MONITOR: AtomicUsize = AtomicUsize::new(0);
static HIDE_ON_FULLSCREEN: AtomicBool = AtomicBool::new(true);

#[tauri::command]
fn set_hit_area(state: State<HitArea>, w: f64, h: f64) {
    *state.0.lock().unwrap() = (w, h);
}

#[tauri::command]
fn set_monitor(index: usize) {
    MONITOR.store(index, Ordering::Relaxed);
}

#[tauri::command]
fn set_hide_on_fullscreen(enabled: bool) {
    HIDE_ON_FULLSCREEN.store(enabled, Ordering::Relaxed);
}

#[tauri::command]
fn monitor_count(window: WebviewWindow) -> usize {
    window.available_monitors().map(|m| m.len()).unwrap_or(1)
}

fn target_monitor(window: &WebviewWindow) -> Option<Monitor> {
    let index = MONITOR.load(Ordering::Relaxed);
    if index > 0 {
        if let Ok(list) = window.available_monitors() {
            if let Some(m) = list.into_iter().nth(index - 1) {
                return Some(m);
            }
        }
    }
    window.primary_monitor().ok().flatten()
}

/// Size the window for the target monitor's scale factor and centre it at the top.
/// Does nothing when it is already in place, so it is cheap to call repeatedly.
fn place_window(window: &WebviewWindow) {
    let Some(monitor) = target_monitor(window) else { return };
    let scale = monitor.scale_factor();
    let want = PhysicalSize::new((WIN_W * scale).round() as u32, (WIN_H * scale).round() as u32);
    let x = monitor.position().x + (monitor.size().width as i32 - want.width as i32) / 2;
    let y = monitor.position().y;

    let (Ok(size), Ok(pos)) = (window.outer_size(), window.outer_position()) else { return };
    if size != want {
        let _ = window.set_size(want);
    }
    if pos.x != x || pos.y != y {
        let _ = window.set_position(PhysicalPosition::new(x, y));
    }
}

/// The window is bigger than the pill so it has room to expand. Outside the pill we let
/// clicks fall through to whatever is underneath, and tell the frontend about hover
/// (a click-through webview doesn't receive mouse events itself).
/// The same loop hides the island while a fullscreen app is in front and keeps it on
/// the chosen monitor when displays are plugged in or rearranged.
fn spawn_watcher(window: WebviewWindow, app: AppHandle) {
    std::thread::spawn(move || {
        let mut inside = false;
        let mut hidden = false;
        let mut tick = 0u32;
        let _ = window.set_ignore_cursor_events(true);
        loop {
            std::thread::sleep(Duration::from_millis(30));
            tick = tick.wrapping_add(1);

            if tick % 10 == 0 {
                let now_hidden =
                    HIDE_ON_FULLSCREEN.load(Ordering::Relaxed) && screen::foreground_is_fullscreen();
                if now_hidden != hidden {
                    hidden = now_hidden;
                    let _ = window.emit("island-hidden", hidden);
                }
            }
            if tick % 40 == 0 {
                place_window(&window);
            }

            let (Ok(cursor), Ok(pos), Ok(size)) =
                (window.cursor_position(), window.outer_position(), window.outer_size())
            else {
                continue;
            };
            let scale = window.scale_factor().unwrap_or(1.0);
            let (w, h) = *app.state::<HitArea>().0.lock().unwrap();
            let (w, h) = ((w + MARGIN * 2.0) * scale, (h + MARGIN * 2.0) * scale);
            let left = pos.x as f64 + (size.width as f64 - w) / 2.0;
            let top = pos.y as f64 + (TOP - MARGIN) * scale;
            let now_inside = !hidden
                && cursor.x >= left
                && cursor.x <= left + w
                && cursor.y >= top
                && cursor.y <= top + h;
            if now_inside != inside {
                inside = now_inside;
                let _ = window.set_ignore_cursor_events(!inside);
                let _ = window.emit("island-hover", inside);
            }
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_drag::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            set_hit_area,
            set_monitor,
            set_hide_on_fullscreen,
            monitor_count,
            files::file_info,
            files::open_path,
            files::reveal_path,
            files::drag_icon,
            media::media_toggle,
            media::media_next,
            media::media_prev,
            media::media_seek
        ])
        .manage(HitArea(Mutex::new((130.0, 34.0))))
        .setup(|app| {
            let window = app.get_webview_window("main").expect("main window");
            place_window(&window);

            let quit = MenuItem::with_id(app, "quit", "Quit Dynamic Island", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&quit])?;
            let mut tray = TrayIconBuilder::new()
                .tooltip("Dynamic Island")
                .menu(&menu)
                .on_menu_event(|app, event| {
                    if event.id() == "quit" {
                        app.exit(0);
                    }
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;

            spawn_watcher(window, app.handle().clone());
            media::spawn(app.handle().clone());
            system::spawn_battery(app.handle().clone());
            system::spawn_volume(app.handle().clone());
            system::spawn_lock_keys(app.handle().clone());
            system::spawn_privacy(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
