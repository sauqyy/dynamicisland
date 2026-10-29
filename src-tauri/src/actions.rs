//! Things the assistant is allowed to do to the computer: launch apps, change the volume, lock or sleep.
//! Each is a small, fixed command; there is deliberately no way to run arbitrary shell text.
use std::os::windows::process::CommandExt;
use std::process::Command;
use std::sync::Mutex;

use serde::Serialize;

const NO_WINDOW: u32 = 0x0800_0000;

#[derive(Serialize, Clone)]
pub struct AppEntry {
    name: String,
    id: String,
}

static APPS: Mutex<Option<Vec<AppEntry>>> = Mutex::new(None);

/// Every app in the Start menu, packaged and classic, via Windows' own list.
fn read_apps() -> Vec<AppEntry> {
    let script = "[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-StartApps | ForEach-Object { $_.Name + [char]9 + $_.AppID }";
    let Ok(out) = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .creation_flags(NO_WINDOW)
        .output()
    else {
        return vec![];
    };
    String::from_utf8_lossy(&out.stdout)
        .lines()
        .filter_map(|l| {
            let (name, id) = l.split_once('\t')?;
            let (name, id) = (name.trim(), id.trim());
            (!name.is_empty() && !id.is_empty()).then(|| AppEntry { name: name.to_string(), id: id.to_string() })
        })
        .collect()
}

/// The installed apps. The list is read once (it takes a second) and kept; `refresh` reads it again.
#[tauri::command]
pub async fn app_list(refresh: bool) -> Vec<AppEntry> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut cache = APPS.lock().unwrap();
        if refresh || cache.is_none() {
            *cache = Some(read_apps());
        }
        cache.clone().unwrap_or_default()
    })
    .await
    .unwrap_or_default()
}

/// Starts an app from the list above. Only ids that list produced are accepted.
#[tauri::command]
pub fn app_launch(id: String) -> Result<(), String> {
    let known = APPS.lock().unwrap().as_ref().is_some_and(|l| l.iter().any(|a| a.id == id));
    if !known {
        return Err("I don't know that app".into());
    }
    Command::new("explorer.exe")
        .arg(format!("shell:AppsFolder\\{id}"))
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

fn with_volume<T>(
    f: impl FnOnce(&windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume) -> windows::core::Result<T>,
) -> Result<T, String> {
    use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
    }
    let v = crate::system::endpoint().ok_or_else(|| "No speakers found".to_string())?;
    f(&v).map_err(|e| e.message())
}

/// Sets the master volume (0-100) and returns it.
#[tauri::command]
pub fn volume_set(level: u8) -> Result<u8, String> {
    let level = level.min(100);
    with_volume(|v| unsafe {
        v.SetMasterVolumeLevelScalar(f32::from(level) / 100.0, std::ptr::null())?;
        // asking for a volume means you want to hear it
        if level > 0 {
            v.SetMute(false, std::ptr::null())?;
        }
        Ok(level)
    })
}

/// Turns the volume up or down by `delta` points and returns the new level.
#[tauri::command]
pub fn volume_adjust(delta: i32) -> Result<u8, String> {
    with_volume(|v| unsafe {
        let now = (v.GetMasterVolumeLevelScalar()? * 100.0).round() as i32;
        let next = (now + delta).clamp(0, 100);
        v.SetMasterVolumeLevelScalar(next as f32 / 100.0, std::ptr::null())?;
        if delta > 0 {
            v.SetMute(false, std::ptr::null())?;
        }
        Ok(next as u8)
    })
}

/// Mutes or unmutes; `None` flips the current state. Returns whether it is muted now.
#[tauri::command]
pub fn volume_mute(mute: Option<bool>) -> Result<bool, String> {
    with_volume(|v| unsafe {
        let next = mute.unwrap_or_else(|| !v.GetMute().map(|m| m.as_bool()).unwrap_or(false));
        v.SetMute(next, std::ptr::null())?;
        Ok(next)
    })
}

/// lock, sleep, shutdown or restart. Shutdown and restart wait 20 seconds so they can still be cancelled.
#[tauri::command]
pub fn power_action(action: String) -> Result<(), String> {
    let mut cmd = match action.as_str() {
        "lock" => {
            let mut c = Command::new("rundll32");
            c.args(["user32.dll,LockWorkStation"]);
            c
        }
        "sleep" => {
            let mut c = Command::new("rundll32");
            c.args(["powrprof.dll,SetSuspendState", "0,1,0"]);
            c
        }
        "shutdown" => {
            let mut c = Command::new("shutdown");
            c.args(["/s", "/t", "20"]);
            c
        }
        "restart" => {
            let mut c = Command::new("shutdown");
            c.args(["/r", "/t", "20"]);
            c
        }
        _ => return Err("unknown power action".into()),
    };
    cmd.creation_flags(NO_WINDOW).spawn().map(|_| ()).map_err(|e| e.to_string())
}

/// Cancels a pending shutdown or restart.
#[tauri::command]
pub fn power_cancel() {
    let _ = Command::new("shutdown").arg("/a").creation_flags(NO_WINDOW).spawn();
}
