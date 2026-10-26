//! Now-playing data from Spotify and Apple Music, read through AppleScript.
//! (The system-wide MediaRemote API is off limits to third-party apps since macOS 15.4.)
use std::io::Read;
use std::process::Command;
use std::time::Duration;

use base64::Engine;
use serde::Serialize;
use tauri::{AppHandle, Emitter};

#[derive(Serialize, Clone, PartialEq)]
struct MediaInfo {
    id: String,
    title: String,
    artist: String,
    album: String,
    playing: bool,
    /// seconds
    position: f64,
    duration: f64,
}

#[derive(Serialize, Clone)]
struct MediaArt {
    id: String,
    data_url: String,
}

const APPS: [&str; 2] = ["Spotify", "Music"];

fn osascript(script: &str) -> Option<String> {
    let out = Command::new("osascript").args(["-e", script]).output().ok()?;
    out.status.success().then(|| String::from_utf8_lossy(&out.stdout).trim().to_string())
}

fn is_running(app: &str) -> bool {
    osascript(&format!("application \"{app}\" is running")).as_deref() == Some("true")
}

/// Spotify reports milliseconds, Music seconds; only Spotify exposes an artwork URL.
fn read_app(app: &str) -> Option<(MediaInfo, String)> {
    let (duration_expr, art_expr) = if app == "Spotify" {
        ("(duration of t) / 1000", "artwork url of t")
    } else {
        ("duration of t", "\"\"")
    };
    let script = format!(
        "tell application \"{app}\"\n\
         if player state is stopped then return \"\"\n\
         set t to current track\n\
         set sep to character id 10\n\
         set art to \"\"\n\
         try\n\
         set art to {art_expr}\n\
         end try\n\
         return (player state as text) & sep & (name of t) & sep & (artist of t) & sep & (album of t) & sep & (player position as text) & sep & ({duration_expr} as text) & sep & art\n\
         end tell"
    );
    let text = osascript(&script).filter(|t| !t.is_empty())?;
    let mut it = text.split('\n');
    let state = it.next()?;
    let title = it.next()?.to_string();
    let artist = it.next().unwrap_or("").to_string();
    let album = it.next().unwrap_or("").to_string();
    // decimal separators follow the user's locale
    let mut num = || it.next().unwrap_or("0").trim().replace(',', ".").parse::<f64>().unwrap_or(0.0);
    let position = num();
    let duration = num();
    let art_url = it.next().unwrap_or("").to_string();
    if title.is_empty() {
        return None;
    }
    let max = if duration > 0.0 { duration } else { f64::MAX };
    let info = MediaInfo {
        id: format!("{artist}\u{1f}{title}"),
        title,
        artist,
        album,
        playing: state == "playing",
        position: position.clamp(0.0, max),
        duration,
    };
    Some((info, art_url))
}

/// The app that is playing, else the first one that has a track loaded.
fn current() -> Option<(&'static str, MediaInfo, String)> {
    let mut paused = None;
    for app in APPS {
        if !is_running(app) {
            continue;
        }
        let Some((info, art)) = read_app(app) else { continue };
        if info.playing {
            return Some((app, info, art));
        }
        paused.get_or_insert((app, info, art));
    }
    paused
}

fn fetch_art(url: &str) -> Option<String> {
    if !url.starts_with("https://") {
        return None;
    }
    let resp = ureq::get(url).timeout(Duration::from_secs(5)).call().ok()?;
    let mime = resp.header("Content-Type").unwrap_or("image/jpeg").to_string();
    let mut buf = Vec::new();
    resp.into_reader().take(8_000_000).read_to_end(&mut buf).ok()?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(buf);
    Some(format!("data:{mime};base64,{b64}"))
}

pub fn spawn(app: AppHandle) {
    std::thread::spawn(move || {
        let mut last: Option<MediaInfo> = None;
        let mut art_id = String::new();
        let mut ticks = 0u32;
        loop {
            std::thread::sleep(Duration::from_millis(1000));
            ticks += 1;

            let now = current();
            let info = now.as_ref().map(|(_, i, _)| i.clone());

            // Send on change, plus a periodic resync so the UI clock can't drift.
            let changed = match (&info, &last) {
                (Some(a), Some(b)) => {
                    let expected = b.position + if b.playing { 1.0 } else { 0.0 };
                    a.id != b.id
                        || a.playing != b.playing
                        || (a.position - expected).abs() > 2.5
                        || a.duration != b.duration
                }
                (None, None) => false,
                _ => true,
            };
            if changed || ticks % 6 == 0 {
                let _ = app.emit("media", &info);
            }

            if let Some((_, i, url)) = &now {
                if art_id != i.id {
                    art_id = i.id.clone();
                    if let Some(data_url) = fetch_art(url) {
                        let _ = app.emit("media-art", MediaArt { id: i.id.clone(), data_url });
                    }
                }
            }
            last = info;
        }
    });
}

fn control(command: String) {
    std::thread::spawn(move || {
        if let Some((app, _, _)) = current() {
            let _ = osascript(&format!("tell application \"{app}\" to {command}"));
        }
    });
}

#[tauri::command]
pub fn media_toggle() {
    control("playpause".into());
}

#[tauri::command]
pub fn media_next() {
    control("next track".into());
}

#[tauri::command]
pub fn media_prev() {
    control("previous track".into());
}

#[tauri::command]
pub fn media_seek(seconds: f64) {
    control(format!("set player position to {}", seconds.max(0.0)));
}
