//! File shelf and app shortcut helpers: metadata, opening, drag-out.
use std::path::Path;
use std::process::Command;

use serde::Serialize;

#[derive(Serialize, Default)]
pub struct FileInfo {
    path: String,
    name: String,
    size: u64,
    is_dir: bool,
    /// Finder's icon for this file as a PNG data URL (not provided on macOS yet)
    icon: Option<String>,
}

fn encode_png(rgba: &[u8], w: u32, h: u32) -> Option<Vec<u8>> {
    let mut out = Vec::new();
    {
        let mut enc = png::Encoder::new(&mut out, w, h);
        enc.set_color(png::ColorType::Rgba);
        enc.set_depth(png::BitDepth::Eight);
        enc.write_header().ok()?.write_image_data(rgba).ok()?;
    }
    Some(out)
}

/// Describes files dropped onto the island; only granted paths (see grants.rs) are looked at.
#[tauri::command(async)]
pub fn file_info(app: tauri::AppHandle, paths: Vec<String>) -> Vec<FileInfo> {
    paths
        .into_iter()
        .filter(|p| crate::grants::is_granted(&app, p))
        .map(|path| {
            let meta = std::fs::metadata(&path).ok();
            FileInfo {
                name: Path::new(&path)
                    .file_name()
                    .map(|n| n.to_string_lossy().into_owned())
                    .unwrap_or_else(|| path.clone()),
                size: meta.as_ref().map(|m| m.len()).unwrap_or(0),
                is_dir: meta.map(|m| m.is_dir()).unwrap_or(false),
                icon: None,
                path,
            }
        })
        .collect()
}

/// Opens a file, folder or app with its default handler: one the user dropped or allowed before,
/// or else once they say yes in the system's own dialog (see grants.rs).
#[tauri::command]
pub async fn open_path(app: tauri::AppHandle, path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        // absolute, so a path can never be read as one of open's options
        if !path.starts_with('/') || !crate::grants::may_open(&app, &path) {
            return Err("Not opened".to_string());
        }
        Command::new("open").arg(&path).spawn().map(|_| ()).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn reveal_path(app: tauri::AppHandle, path: String) -> Result<(), String> {
    if !path.starts_with('/') || !(crate::grants::is_granted(&app, &path) || crate::grants::plain(&path)) {
        return Err("Not shown".into());
    }
    Command::new("open").args(["-R", &path]).spawn().map(|_| ()).map_err(|e| e.to_string())
}

/// A small translucent square used as the ghost image while dragging a file out of the shelf.
#[tauri::command]
pub fn drag_icon() -> Option<String> {
    let path = std::env::temp_dir().join("dynamic-island-drag.png");
    if !path.exists() {
        let rgba: Vec<u8> = (0..48 * 48).flat_map(|_| [255u8, 255, 255, 110]).collect();
        std::fs::write(&path, encode_png(&rgba, 48, 48)?).ok()?;
    }
    Some(path.to_string_lossy().into_owned())
}
