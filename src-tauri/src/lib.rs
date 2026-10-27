mod auth;
#[cfg(windows)]
mod files;
#[cfg(windows)]
mod media;
#[cfg(windows)]
mod screen;
#[cfg(windows)]
mod system;
#[cfg(target_os = "macos")]
#[path = "files_mac.rs"]
mod files;
#[cfg(target_os = "macos")]
#[path = "media_mac.rs"]
mod media;
#[cfg(target_os = "macos")]
#[path = "screen_mac.rs"]
mod screen;
#[cfg(target_os = "macos")]
#[path = "system_mac.rs"]
mod system;
#[cfg(target_os = "macos")]
mod macos;

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
/// Window size in logical px: wide and tall enough for the expanded card at the chosen scale.
static WIN_SIZE: Mutex<(f64, f64)> = Mutex::new((520.0, 340.0));

/// Size of the interactive area in logical px, reported by the frontend.
struct HitArea(Mutex<(f64, f64)>);

/// 0 = primary monitor, n = n-th entry of the monitor list.
static MONITOR: AtomicUsize = AtomicUsize::new(0);
static HIDE_ON_FULLSCREEN: AtomicBool = AtomicBool::new(true);
/// True while the user drags the island, so the watcher doesn't turn click-through back on.
static DRAGGING: AtomicBool = AtomicBool::new(false);
/// True while the chat is fullscreen: the window then covers the whole target monitor.
static FULLSCREEN: AtomicBool = AtomicBool::new(false);
/// How far the user moved the island from its default spot (centre top), in logical px.
static OFFSET: Mutex<(f64, f64)> = Mutex::new((0.0, 0.0));

/// Seconds since the last keyboard or mouse input anywhere on the computer (drives the automatic Idle status).
#[tauri::command]
fn idle_seconds() -> u64 {
    #[cfg(windows)]
    {
        use windows::Win32::System::SystemInformation::GetTickCount;
        use windows::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
        let mut info = LASTINPUTINFO {
            cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
            dwTime: 0,
        };
        if unsafe { GetLastInputInfo(&mut info) }.as_bool() {
            return (unsafe { GetTickCount() }.wrapping_sub(info.dwTime) / 1000) as u64;
        }
        0
    }
    #[cfg(target_os = "macos")]
    {
        // HIDIdleTime is in nanoseconds
        let out = std::process::Command::new("ioreg").args(["-c", "IOHIDSystem", "-d", "4"]).output();
        if let Ok(o) = out {
            let text = String::from_utf8_lossy(&o.stdout);
            if let Some(line) = text.lines().find(|l| l.contains("HIDIdleTime")) {
                if let Some(n) = line.rsplit('=').next().and_then(|v| v.trim().parse::<u64>().ok()) {
                    return n / 1_000_000_000;
                }
            }
        }
        0
    }
}

#[tauri::command]
fn set_hit_area(state: State<HitArea>, w: f64, h: f64) {
    *state.0.lock().unwrap() = (w, h);
}

#[tauri::command]
fn set_window_size(window: WebviewWindow, w: f64, h: f64) {
    *WIN_SIZE.lock().unwrap() = (w.clamp(300.0, 1400.0), h.clamp(120.0, 900.0));
    place_window(&window);
}

/// Grow the window to cover the target monitor (or put it back). Returns the monitor's
/// logical size so the frontend can size the island to match.
#[tauri::command]
fn set_fullscreen(window: WebviewWindow, on: bool) -> (f64, f64) {
    FULLSCREEN.store(on, Ordering::Relaxed);
    place_window(&window);
    match target_monitor(&window) {
        Some(m) => {
            let scale = m.scale_factor();
            (m.size().width as f64 / scale, m.size().height as f64 / scale)
        }
        None => (0.0, 0.0),
    }
}

#[tauri::command]
fn set_offset(window: WebviewWindow, x: f64, y: f64) {
    *OFFSET.lock().unwrap() = (x, y);
    place_window(&window);
}

#[tauri::command]
fn set_dragging(on: bool) {
    DRAGGING.store(on, Ordering::Relaxed);
}

#[tauri::command]
fn set_monitor(index: usize) {
    MONITOR.store(index, Ordering::Relaxed);
}

#[tauri::command]
fn set_hide_on_fullscreen(enabled: bool) {
    HIDE_ON_FULLSCREEN.store(enabled, Ordering::Relaxed);
}

#[derive(Clone, serde::Serialize)]
struct UpdateProgress {
    /// "downloading", "installing" or "failed"
    stage: &'static str,
    percent: u32,
}

fn download_installer(app: &AppHandle, url: &str, dest: &std::path::Path) -> Result<(), String> {
    use std::io::{Read, Write};
    let resp = ureq::get(url).call().map_err(|e| e.to_string())?;
    let total: u64 = resp.header("Content-Length").and_then(|v| v.parse().ok()).unwrap_or(0);
    let mut reader = resp.into_reader();
    let mut file = std::fs::File::create(dest).map_err(|e| e.to_string())?;
    let mut buf = [0u8; 64 * 1024];
    let (mut done, mut last) = (0u64, u32::MAX);
    loop {
        let n = reader.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        file.write_all(&buf[..n]).map_err(|e| e.to_string())?;
        done += n as u64;
        let percent = if total > 0 { (done * 100 / total).min(100) as u32 } else { 0 };
        if percent != last {
            last = percent;
            let _ = app.emit("update-progress", UpdateProgress { stage: "downloading", percent });
        }
    }
    if done == 0 || (total > 0 && done != total) {
        return Err("download incomplete".into());
    }
    Ok(())
}

/// Downloads the installer from a GitHub release of this project (reporting progress to the
/// island), then runs it silently as an in-place upgrade; the new version starts by itself.
#[cfg(windows)]
#[tauri::command]
async fn install_update(app: AppHandle, url: String) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    if !url.starts_with("https://github.com/sauqyy/dynamicisland/releases/download/") || url.contains('\'') {
        return Err("unexpected update url".into());
    }
    let dest = std::env::temp_dir().join("dynamic-island-update.exe");
    let _ = app.emit("update-progress", UpdateProgress { stage: "downloading", percent: 0 });
    let (app2, dest2) = (app.clone(), dest.clone());
    let result = tauri::async_runtime::spawn_blocking(move || download_installer(&app2, &url, &dest2))
        .await
        .map_err(|e| e.to_string())
        .and_then(|r| r);
    if let Err(e) = result {
        let _ = app.emit("update-progress", UpdateProgress { stage: "failed", percent: 0 });
        return Err(e);
    }
    let _ = app.emit("update-progress", UpdateProgress { stage: "installing", percent: 100 });
    // /S = no windows, /UPDATE = upgrade in place and relaunch the app afterwards
    // (DETACHED_PROCESS | CREATE_NO_WINDOW so the installer outlives this process)
    if let Err(e) = std::process::Command::new(&dest)
        .args(["/S", "/UPDATE"])
        .creation_flags(0x0000_0008 | 0x0800_0000)
        .spawn()
    {
        let _ = app.emit("update-progress", UpdateProgress { stage: "failed", percent: 0 });
        return Err(e.to_string());
    }
    pause_before_exit().await;
    app.exit(0);
    Ok(())
}

/// macOS: downloads the disk image and opens it, so the user can drag the new app over the old one.
#[cfg(target_os = "macos")]
#[tauri::command]
async fn install_update(app: AppHandle, url: String) -> Result<(), String> {
    if !url.starts_with("https://github.com/sauqyy/dynamicisland/releases/download/") || !url.ends_with(".dmg") {
        return Err("unexpected update url".into());
    }
    let dest = std::env::temp_dir().join("dynamic-island-update.dmg");
    let _ = app.emit("update-progress", UpdateProgress { stage: "downloading", percent: 0 });
    let (app2, dest2) = (app.clone(), dest.clone());
    let result = tauri::async_runtime::spawn_blocking(move || download_installer(&app2, &url, &dest2))
        .await
        .map_err(|e| e.to_string())
        .and_then(|r| r);
    let result = result.and_then(|_| std::process::Command::new("open").arg(&dest).spawn().map(|_| ()).map_err(|e| e.to_string()));
    match result {
        Ok(()) => {
            let _ = app.emit("update-progress", UpdateProgress { stage: "installing", percent: 100 });
            Ok(())
        }
        Err(e) => {
            let _ = app.emit("update-progress", UpdateProgress { stage: "failed", percent: 0 });
            Err(e)
        }
    }
}

#[cfg(windows)]
async fn pause_before_exit() {
    let _ = tauri::async_runtime::spawn_blocking(|| std::thread::sleep(Duration::from_millis(1200))).await;
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
    if FULLSCREEN.load(Ordering::Relaxed) {
        let want = *monitor.size();
        let at = *monitor.position();
        let (Ok(size), Ok(pos)) = (window.outer_size(), window.outer_position()) else { return };
        if size != want {
            let _ = window.set_size(want);
        }
        if pos != at {
            let _ = window.set_position(at);
        }
        return;
    }
    let (_, win_h) = *WIN_SIZE.lock().unwrap();
    // As wide as the monitor even when idle (it is click-through outside the pill anyway), so going
    // fullscreen only changes the height and the pill never moves or re-centres while the window resizes.
    let want = PhysicalSize::new(monitor.size().width, (win_h * scale).round() as u32);
    // keep the pill on this monitor, whatever offset was saved (e.g. from a bigger display)
    let (off_x, off_y) = *OFFSET.lock().unwrap();
    let mon_w = monitor.size().width as f64;
    let mon_h = monitor.size().height as f64;
    let off_x = (off_x * scale).clamp(-(mon_w / 2.0 - 80.0 * scale), mon_w / 2.0 - 80.0 * scale);
    let off_y = (off_y * scale).clamp(0.0, (mon_h - 120.0 * scale).max(0.0));
    let x = monitor.position().x + (monitor.size().width as i32 - want.width as i32) / 2 + off_x as i32;
    let y = monitor.position().y + off_y as i32;

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
                && (DRAGGING.load(Ordering::Relaxed)
                    || (cursor.x >= left
                        && cursor.x <= left + w
                        && cursor.y >= top
                        && cursor.y <= top + h));
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
            idle_seconds,
            set_window_size,
            set_monitor,
            set_offset,
            set_fullscreen,
            set_dragging,
            auth::oauth_wait,
            auth::open_url,
            set_hide_on_fullscreen,
            monitor_count,
            install_update,
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
            #[cfg(target_os = "macos")]
            macos::float_above_menu_bar(&window);
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
