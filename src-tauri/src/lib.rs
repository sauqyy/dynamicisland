#[cfg(windows)]
mod actions;
#[cfg(target_os = "macos")]
#[path = "actions_mac.rs"]
mod actions;
mod assistant;
mod auth;
mod claude;
mod grants;
mod public_data;
mod llm;
mod llm_core;
#[cfg(feature = "campus")]
mod scele;
#[cfg(feature = "campus")]
mod slcm;
#[cfg(feature = "campus")]
mod sso;
#[cfg(feature = "campus")]
mod seal;
#[cfg(windows)]
mod files;
#[cfg(windows)]
mod media;
#[cfg(windows)]
mod screen;
#[cfg(windows)]
mod speech;
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
#[path = "speech_mac.rs"]
mod speech;
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
    AppHandle, Emitter, Manager, Monitor, PhysicalSize, State, WebviewWindow,
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
/// True while the island is docked to the bottom of the screen, on top of the taskbar: it then
/// grows upwards from the work area's bottom edge, and the vertical offset is ignored.
static BOTTOM: AtomicBool = AtomicBool::new(false);

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

/// Docks the island to the bottom of the work area (or back to its offset). Returns that bottom edge
/// in logical px from the monitor's top, so the frontend can draw the island resting on the taskbar.
#[tauri::command]
fn set_dock_bottom(window: WebviewWindow, on: bool) -> f64 {
    BOTTOM.store(on, Ordering::Relaxed);
    place_window(&window);
    target_monitor(&window).map(|m| work_bottom(&m) / m.scale_factor()).unwrap_or(0.0)
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

/// The public half of the key every release is signed with (made with `npx tauri signer generate`;
/// see SECURITY.md). The private half exists only with the maintainer and in the CI secret
/// TAURI_SIGNING_PRIVATE_KEY, so a release anyone else attaches, or one swapped on the way, is refused.
const UPDATE_PUBKEY: &str = include_str!("../updater.pub");

/// Largest installer accepted.
const UPDATE_LIMIT: u64 = 1024 * 1024 * 1024;

/// "1.2.3" -> [1, 2, 3], so versions compare the way people expect.
fn version_key(v: &str) -> Vec<u64> {
    v.split('.').map(|p| p.parse().unwrap_or(0)).collect()
}

/// An installer attached to one of this project's own GitHub releases, newer than this app, with
/// the file type this platform installs: its file name (e.g. "AstraIsle_0.9.0_x64-setup.exe").
/// The address is parsed (so "../" can't climb out to another repository), not just prefix-checked.
fn release_file(app: &AppHandle, url: &str, ext: &str) -> Result<String, String> {
    let bad = || "unexpected update url".to_string();
    let u = tauri::Url::parse(url).map_err(|_| bad())?;
    if u.scheme() != "https" || u.host_str() != Some("github.com") || u.port().is_some() || !u.username().is_empty() || u.query().is_some() || u.fragment().is_some() {
        return Err(bad());
    }
    let segs: Vec<&str> = u.path_segments().map(|s| s.collect()).unwrap_or_default();
    if segs.len() != 6 || segs[..4] != ["sauqyy", "dynamicisland", "releases", "download"] || segs.iter().any(|s| s.is_empty() || s.contains('%')) {
        return Err(bad());
    }
    let name = segs[5];
    if !name.ends_with(ext) {
        return Err(bad());
    }
    // never an older (or the same) version: a signed but outdated installer could bring back an old bug
    let version = name.split('_').nth(1).ok_or_else(bad)?;
    if version_key(version) <= version_key(&app.package_info().version.to_string()) {
        return Err("that update isn't newer than this version".into());
    }
    Ok(name.to_string())
}

/// Reads the whole download into memory, reporting progress.
fn download(app: &AppHandle, url: &str, progress: bool) -> Result<Vec<u8>, String> {
    use std::io::Read;
    let resp = ureq::get(url).timeout(Duration::from_secs(600)).call().map_err(|e| e.to_string())?;
    let total: u64 = resp.header("Content-Length").and_then(|v| v.parse().ok()).unwrap_or(0);
    if total > UPDATE_LIMIT {
        return Err("the update is too large".into());
    }
    let mut reader = resp.into_reader().take(UPDATE_LIMIT + 1);
    let mut bytes = Vec::with_capacity(total as usize);
    let mut buf = [0u8; 64 * 1024];
    let mut last = u32::MAX;
    loop {
        let n = reader.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        bytes.extend_from_slice(&buf[..n]);
        let percent = if total > 0 { (bytes.len() as u64 * 100 / total).min(100) as u32 } else { 0 };
        if progress && percent != last {
            last = percent;
            let _ = app.emit("update-progress", UpdateProgress { stage: "downloading", percent });
        }
    }
    if bytes.is_empty() || bytes.len() as u64 > UPDATE_LIMIT || (total > 0 && bytes.len() as u64 != total) {
        return Err("download incomplete".into());
    }
    Ok(bytes)
}

/// Checks the release's signature (the `.sig` beside it, made by `tauri signer sign`) against the key
/// built into this app, and that it was made for exactly this file name.
fn verify_update(bytes: &[u8], sig: &[u8], name: &str) -> Result<(), String> {
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD;
    let unsigned = || "the update isn't signed with this app's key, so it wasn't installed".to_string();
    let no_key = || "this build has no update key".to_string();
    let key_text = b64.decode(UPDATE_PUBKEY.trim()).ok().and_then(|k| String::from_utf8(k).ok()).ok_or_else(no_key)?;
    let key = minisign_verify::PublicKey::decode(&key_text).map_err(|_| no_key())?;
    let sig_text = std::str::from_utf8(sig).ok().and_then(|s| b64.decode(s.trim()).ok()).and_then(|s| String::from_utf8(s).ok()).ok_or_else(unsigned)?;
    let signature = minisign_verify::Signature::decode(&sig_text).map_err(|_| unsigned())?;
    key.verify(bytes, &signature, true).map_err(|_| unsigned())?;
    // the trusted comment is covered by the signature: "timestamp:…<tab>file:<name>"
    let signed_for = signature.trusted_comment().split('\t').find_map(|p| p.strip_prefix("file:")).unwrap_or("");
    if signed_for != name {
        return Err(unsigned());
    }
    Ok(())
}

/// Downloads a release file and its signature and verifies them, then writes the file into a folder
/// of the app's own (not the shared temp folder, where another program could swap it first).
fn fetch_verified(app: &AppHandle, url: &str, name: &str) -> Result<std::path::PathBuf, String> {
    let sig = download(app, &format!("{url}.sig"), false).map_err(|_| "the update has no signature, so it wasn't installed".to_string())?;
    let bytes = download(app, url, true)?;
    verify_update(&bytes, &sig, name)?;
    let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("updates");
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let dest = dir.join(name);
    std::fs::write(&dest, &bytes).map_err(|e| e.to_string())?;
    Ok(dest)
}

/// Downloads the installer from a GitHub release of this project (reporting progress to the
/// island), verifies its signature, then runs it silently as an in-place upgrade; the new version
/// starts by itself.
#[cfg(windows)]
#[tauri::command]
async fn install_update(app: AppHandle, url: String) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    let name = release_file(&app, &url, ".exe")?;
    let _ = app.emit("update-progress", UpdateProgress { stage: "downloading", percent: 0 });
    let app2 = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || fetch_verified(&app2, &url, &name))
        .await
        .map_err(|e| e.to_string())
        .and_then(|r| r);
    let dest = match result {
        Ok(d) => d,
        Err(e) => {
            let _ = app.emit("update-progress", UpdateProgress { stage: "failed", percent: 0 });
            return Err(e);
        }
    };
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

/// macOS: downloads the disk image, verifies its signature and opens it, so the user can drag the
/// new app over the old one.
#[cfg(target_os = "macos")]
#[tauri::command]
async fn install_update(app: AppHandle, url: String) -> Result<(), String> {
    let name = release_file(&app, &url, ".dmg")?;
    let _ = app.emit("update-progress", UpdateProgress { stage: "downloading", percent: 0 });
    let app2 = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || fetch_verified(&app2, &url, &name))
        .await
        .map_err(|e| e.to_string())
        .and_then(|r| r);
    let result = result.and_then(|dest| std::process::Command::new("open").arg(&dest).spawn().map(|_| ()).map_err(|e| e.to_string()));
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

/// The island's drag offset in physical px, kept on the monitor whatever offset was saved
/// (e.g. from a bigger display).
fn island_offset(monitor: &Monitor) -> (f64, f64) {
    let scale = monitor.scale_factor();
    let (off_x, off_y) = *OFFSET.lock().unwrap();
    let mon_w = monitor.size().width as f64;
    let mon_h = monitor.size().height as f64;
    (
        (off_x * scale).clamp(-(mon_w / 2.0 - 80.0 * scale), mon_w / 2.0 - 80.0 * scale),
        (off_y * scale).clamp(0.0, (mon_h - 120.0 * scale).max(0.0)),
    )
}

/// The bottom of the monitor's work area (where the taskbar starts), in physical px from the monitor's top.
fn work_bottom(monitor: &Monitor) -> f64 {
    let area = monitor.work_area();
    (area.position.y - monitor.position().y) as f64 + area.size.height as f64
}

/// Put the window at the monitor's top-left corner, as wide as the monitor. It never moves: dragging the
/// island only moves it inside the page (and makes the window taller), so going fullscreen is just a height
/// change and the island can't jump. The window is click-through outside the pill.
/// Does nothing when it is already in place, so it is cheap to call repeatedly.
fn place_window(window: &WebviewWindow) {
    let Some(monitor) = target_monitor(window) else { return };
    let scale = monitor.scale_factor();
    let height = if FULLSCREEN.load(Ordering::Relaxed) {
        monitor.size().height
    } else if BOTTOM.load(Ordering::Relaxed) {
        // down to the taskbar and no further, so the island can sit on it and grow upwards
        work_bottom(&monitor).max(120.0 * scale) as u32
    } else {
        let (_, win_h) = *WIN_SIZE.lock().unwrap();
        // rounded up to steps so dragging the island down doesn't resize the window on every frame
        (((island_offset(&monitor).1 + win_h * scale) / 96.0).ceil() * 96.0) as u32
    };
    let want = PhysicalSize::new(monitor.size().width, height);
    let at = *monitor.position();

    let (Ok(size), Ok(pos)) = (window.outer_size(), window.outer_position()) else { return };
    if size != want {
        let _ = window.set_size(want);
    }
    if pos != at {
        let _ = window.set_position(at);
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
            let fullscreen = FULLSCREEN.load(Ordering::Relaxed);
            let monitor = target_monitor(&window);
            let (off_x, off_y) = if fullscreen {
                (0.0, 0.0)
            } else {
                monitor.as_ref().map(island_offset).unwrap_or((0.0, 0.0))
            };
            let left = pos.x as f64 + (size.width as f64 - w) / 2.0 + off_x;
            // docked to the bottom, the island's lower edge rests on the taskbar and it grows upwards
            let top = match monitor.as_ref() {
                Some(m) if !fullscreen && BOTTOM.load(Ordering::Relaxed) => pos.y as f64 + work_bottom(m) - h + MARGIN * scale,
                _ => pos.y as f64 + off_y + (TOP - MARGIN) * scale,
            };
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
        // Must be registered first. A second launch just exits; the running island stays.
        .plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| {}))
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_drag::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        // the assistant hotkey is registered from the webview, so it can be rebound in Settings
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            set_hit_area,
            idle_seconds,
            set_window_size,
            set_monitor,
            set_offset,
            set_dock_bottom,
            set_fullscreen,
            set_dragging,
            auth::oauth_wait,
            auth::open_url,
            public_data::public_json,
            #[cfg(feature = "campus")]
            scele::scele_login,
            #[cfg(feature = "campus")]
            scele::scele_account,
            #[cfg(feature = "campus")]
            scele::scele_logout,
            #[cfg(feature = "campus")]
            scele::scele_call,
            #[cfg(feature = "campus")]
            scele::scele_file,
            #[cfg(feature = "campus")]
            scele::web_doc,
            #[cfg(feature = "campus")]
            slcm::slcm_open,
            #[cfg(feature = "campus")]
            slcm::slcm_saved,
            #[cfg(feature = "campus")]
            slcm::slcm_show,
            #[cfg(feature = "campus")]
            slcm::slcm_cancel,
            #[cfg(feature = "campus")]
            slcm::slcm_forget,
            #[cfg(feature = "campus")]
            sso::sso_verify,
            #[cfg(feature = "campus")]
            sso::sso_student,
            #[cfg(feature = "campus")]
            sso::sso_forget,
            set_hide_on_fullscreen,
            monitor_count,
            install_update,
            files::file_info,
            files::open_path,
            files::reveal_path,
            files::drag_icon,
            system::clipboard_private,
            media::media_toggle,
            media::media_next,
            media::media_prev,
            media::media_seek,
            speech::speech_prepare,
            speech::speech_start,
            speech::speech_stop,
            assistant::assistant_has_key,
            assistant::assistant_set_key,
            assistant::assistant_clear_key,
            assistant::assistant_tts,
            assistant::assistant_log,
            claude::claude_status,
            claude::claude_login,
            claude::claude_logout,
            claude::claude_chat,
            llm::llm_prepare,
            llm::llm_chat,
            llm::llm_installed,
            llm::llm_info,
            actions::app_list,
            actions::app_launch,
            actions::volume_set,
            actions::volume_adjust,
            actions::volume_mute,
            actions::power_action,
            actions::power_cancel
        ])
        .manage(HitArea(Mutex::new((130.0, 34.0))))
        // files dropped onto the island are the user's choice: only those may be read or opened
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) = event {
                grants::dropped(window.app_handle(), paths);
            }
        })
        .on_webview_event(|webview, event| {
            if let tauri::WebviewEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) = event {
                grants::dropped(webview.app_handle(), paths);
            }
        })
        .setup(|app| {
            grants::restore(app.handle());
            let window = app.get_webview_window("main").expect("main window");
            #[cfg(target_os = "macos")]
            macos::float_above_menu_bar(&window);
            place_window(&window);

            let quit = MenuItem::with_id(app, "quit", "Quit Astra Isle", true, None::<&str>)?;
            // a way back to the top centre that does not need the pill to be clickable
            let reset = MenuItem::with_id(app, "reset-position", "Reset island position", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&reset, &quit])?;
            let mut tray = TrayIconBuilder::new()
                .tooltip("Astra Isle")
                .menu(&menu)
                .on_menu_event(|app, event| {
                    if event.id() == "quit" {
                        app.exit(0);
                    } else if event.id() == "reset-position" {
                        let _ = app.emit("reset-position", ());
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
            system::spawn_brightness(app.handle().clone());
            system::spawn_lock_keys(app.handle().clone());
            system::spawn_privacy(app.handle().clone());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| {
            // the built-in brain runs as its own program; it goes when the app does
            if let tauri::RunEvent::Exit = event {
                llm::shutdown();
            }
        });
}
