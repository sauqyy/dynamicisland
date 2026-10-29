//! Things the assistant is allowed to do to the computer: launch apps, change the volume, lock or sleep.
use std::process::Command;
use std::sync::Mutex;

use serde::Serialize;

#[derive(Serialize, Clone)]
pub struct AppEntry {
    name: String,
    id: String,
}

static APPS: Mutex<Option<Vec<AppEntry>>> = Mutex::new(None);

fn read_apps() -> Vec<AppEntry> {
    let mut out = vec![];
    for dir in ["/Applications", "/System/Applications", "/Applications/Utilities"] {
        if let Ok(rd) = std::fs::read_dir(dir) {
            for e in rd.flatten() {
                let p = e.path();
                if p.extension().is_some_and(|x| x == "app") {
                    if let Some(name) = p.file_stem().and_then(|s| s.to_str()) {
                        out.push(AppEntry { name: name.to_string(), id: p.to_string_lossy().into_owned() });
                    }
                }
            }
        }
    }
    out
}

#[tauri::command]
pub async fn app_list(refresh: bool) -> Vec<AppEntry> {
    let mut cache = APPS.lock().unwrap();
    if refresh || cache.is_none() {
        *cache = Some(read_apps());
    }
    cache.clone().unwrap_or_default()
}

#[tauri::command]
pub fn app_launch(id: String) -> Result<(), String> {
    let known = APPS.lock().unwrap().as_ref().is_some_and(|l| l.iter().any(|a| a.id == id));
    if !known {
        return Err("I don't know that app".into());
    }
    Command::new("open").arg(id).spawn().map(|_| ()).map_err(|e| e.to_string())
}

fn osa(script: &str) -> Result<String, String> {
    let out = Command::new("osascript").args(["-e", script]).output().map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

#[tauri::command]
pub fn volume_set(level: u8) -> Result<u8, String> {
    let level = level.min(100);
    osa(&format!("set volume output volume {level}"))?;
    Ok(level)
}

#[tauri::command]
pub fn volume_adjust(delta: i32) -> Result<u8, String> {
    let now: i32 = osa("output volume of (get volume settings)")?.parse().unwrap_or(50);
    volume_set((now + delta).clamp(0, 100) as u8)
}

#[tauri::command]
pub fn volume_mute(mute: Option<bool>) -> Result<bool, String> {
    let next = match mute {
        Some(m) => m,
        None => osa("output muted of (get volume settings)")? != "true",
    };
    osa(&format!("set volume output muted {next}"))?;
    Ok(next)
}

#[tauri::command]
pub fn power_action(action: String) -> Result<(), String> {
    match action.as_str() {
        "lock" => Command::new("pmset").arg("displaysleepnow").spawn().map(|_| ()),
        "sleep" => Command::new("pmset").arg("sleepnow").spawn().map(|_| ()),
        "shutdown" => Command::new("osascript").args(["-e", "tell application \"System Events\" to shut down"]).spawn().map(|_| ()),
        "restart" => Command::new("osascript").args(["-e", "tell application \"System Events\" to restart"]).spawn().map(|_| ()),
        _ => return Err("unknown power action".into()),
    }
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn power_cancel() {}
