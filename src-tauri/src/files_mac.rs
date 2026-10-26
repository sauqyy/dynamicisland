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

#[tauri::command(async)]
pub fn file_info(paths: Vec<String>) -> Vec<FileInfo> {
    paths
        .into_iter()
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

/// Opens a file, folder or app with its default handler.
#[tauri::command]
pub fn open_path(path: String) {
    let _ = Command::new("open").arg(path).spawn();
}

#[tauri::command]
pub fn reveal_path(path: String) {
    let _ = Command::new("open").args(["-R", &path]).spawn();
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
