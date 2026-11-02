//! A copy of the user's own lists (to-dos and their groups) in the app's config folder. The webview's
//! localStorage is the working copy, but it lives in the webview's data folder, which an update, a
//! reinstall or a cleanup can wipe. This copy survives that, and the island restores from it.
use std::path::PathBuf;

use tauri::{AppHandle, Manager};

/// Only these names are kept, so a name from the webview can never point at another file.
const NAMES: [&str; 2] = ["todos", "todoGroups"];
/// Far more than anyone's to-dos; stops a runaway write from filling the disk.
const MAX_BYTES: usize = 8 * 1024 * 1024;

fn file(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    if !NAMES.contains(&name) {
        return Err("unknown list".into());
    }
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?.join("keep");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(format!("{name}.json")))
}

#[tauri::command]
pub fn keep_load(app: AppHandle, name: String) -> Option<String> {
    std::fs::read_to_string(file(&app, &name).ok()?).ok()
}

#[tauri::command]
pub fn keep_save(app: AppHandle, name: String, json: String) -> Result<(), String> {
    if json.len() > MAX_BYTES {
        return Err("too large".into());
    }
    let path = file(&app, &name)?;
    // written beside it and renamed, so a crash mid-write can't leave half a list
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, json).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())
}
