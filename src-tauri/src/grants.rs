//! The files and folders the user handed the island themselves: dropped onto it, or allowed once in
//! a system dialog. Only these are shown through the asset protocol (thumbnails) and opened without
//! asking. The list lives here in Rust and the dialog is the system's own, so a script that got into
//! the webview can neither read nor run any other file on the computer, nor click "Yes" for the user.
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::{AppHandle, Manager};

/// The oldest grants go first past this many.
const LIMIT: usize = 2000;

static GRANTED: Mutex<Option<Vec<String>>> = Mutex::new(None);

fn file(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_config_dir().ok()?;
    std::fs::create_dir_all(&dir).ok()?;
    Some(dir.join("granted.json"))
}

/// Windows paths don't care about case.
fn key(path: &str) -> String {
    if cfg!(windows) { path.to_lowercase() } else { path.to_string() }
}

fn with<T>(app: &AppHandle, f: impl FnOnce(&mut Vec<String>) -> T) -> T {
    let mut guard = GRANTED.lock().unwrap_or_else(|e| e.into_inner());
    let list = guard.get_or_insert_with(|| {
        file(app)
            .and_then(|p| std::fs::read_to_string(p).ok())
            .and_then(|t| serde_json::from_str(&t).ok())
            .unwrap_or_default()
    });
    f(list)
}

pub fn is_granted(app: &AppHandle, path: &str) -> bool {
    let k = key(path);
    with(app, |list| list.iter().any(|g| key(g) == k))
}

pub fn grant(app: &AppHandle, paths: &[String]) {
    with(app, |list| {
        for p in paths {
            let k = key(p);
            list.retain(|g| key(g) != k);
            list.push(p.clone());
        }
        if list.len() > LIMIT {
            let extra = list.len() - LIMIT;
            list.drain(..extra);
        }
        if let (Some(f), Ok(json)) = (file(app), serde_json::to_string(list)) {
            let _ = std::fs::write(f, json);
        }
    });
    for p in paths {
        allow_asset(app, p);
    }
}

/// Files dropped onto the island: the user chose them.
pub fn dropped(app: &AppHandle, paths: &[PathBuf]) {
    let paths: Vec<String> = paths.iter().map(|p| p.to_string_lossy().into_owned()).collect();
    grant(app, &paths);
}

/// At start-up: the thumbnails of the shelf's images show again.
pub fn restore(app: &AppHandle) {
    for p in with(app, |list| list.clone()) {
        allow_asset(app, &p);
    }
}

fn is_image(path: &str) -> bool {
    Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| matches!(e.to_ascii_lowercase().as_str(), "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "avif"))
}

/// Only images are ever readable by the webview, and only granted ones.
fn allow_asset(app: &AppHandle, path: &str) {
    if is_image(path) {
        let _ = app.asset_protocol_scope().allow_file(path);
    }
}

/// A path that is safe to hand to the shell at all: absolute, with nothing in it a command line
/// could read as another argument, and not on a network share (Windows signs in to a share with the
/// user's account the moment a path on it is touched, which hands its owner the password hash).
pub fn plain(path: &str) -> bool {
    if path.is_empty() || path.chars().any(|c| c.is_control() || c == '"') {
        return false;
    }
    if cfg!(windows) {
        Path::new(path).is_absolute() && !path.starts_with(r"\\") && !path.starts_with("//")
    } else {
        path.starts_with('/')
    }
}

/// Asks the user in the system's own dialog, which the webview can't answer for them.
#[cfg(windows)]
pub fn confirm(question: &str) -> bool {
    use windows::core::PCWSTR;
    use windows::Win32::UI::WindowsAndMessaging::{
        MessageBoxW, IDYES, MB_DEFBUTTON2, MB_ICONWARNING, MB_SETFOREGROUND, MB_TOPMOST, MB_YESNO,
    };
    let text: Vec<u16> = question.encode_utf16().chain(Some(0)).collect();
    let title: Vec<u16> = "Astra Isle".encode_utf16().chain(Some(0)).collect();
    unsafe {
        MessageBoxW(
            None,
            PCWSTR(text.as_ptr()),
            PCWSTR(title.as_ptr()),
            MB_YESNO | MB_ICONWARNING | MB_DEFBUTTON2 | MB_TOPMOST | MB_SETFOREGROUND,
        ) == IDYES
    }
}

#[cfg(target_os = "macos")]
pub fn confirm(question: &str) -> bool {
    // an AppleScript string literal: backslashes and quotes escaped
    let quoted = question.replace('\\', "\\\\").replace('"', "\\\"");
    let script = format!(
        "display dialog \"{quoted}\" with title \"Astra Isle\" buttons {{\"Cancel\", \"Open\"}} default button \"Cancel\" with icon caution"
    );
    std::process::Command::new("osascript")
        .args(["-e", &script])
        .output()
        .is_ok_and(|o| o.status.success() && String::from_utf8_lossy(&o.stdout).contains("Open"))
}

/// May the island open `path`? A granted one yes; any other is asked about once in the system
/// dialog, and remembered if allowed.
pub fn may_open(app: &AppHandle, path: &str) -> bool {
    if is_granted(app, path) {
        return true;
    }
    if !plain(path) {
        return false;
    }
    let ok = confirm(&format!(
        "Astra Isle was asked to open:\n\n{path}\n\nThis can run a program. Only allow it if you asked for this yourself."
    ));
    if ok {
        grant(app, &[path.to_string()]);
    }
    ok
}
