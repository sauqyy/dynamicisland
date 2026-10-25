//! File shelf and app shortcut helpers: metadata, Explorer icons, opening, drag-out.
use std::ffi::c_void;
use std::os::windows::process::CommandExt;
use std::path::Path;
use std::process::Command;

use base64::Engine;
use serde::Serialize;
use windows::core::PCWSTR;
use windows::Win32::Graphics::Gdi::{
    DeleteObject, GetDC, GetDIBits, GetObjectW, ReleaseDC, BITMAP, BITMAPINFO, BITMAPINFOHEADER,
    BI_RGB, DIB_RGB_COLORS,
};
use windows::Win32::Storage::FileSystem::FILE_FLAGS_AND_ATTRIBUTES;
use windows::Win32::System::Com::{CoInitializeEx, COINIT_APARTMENTTHREADED};
use windows::Win32::UI::Shell::{SHGetFileInfoW, SHFILEINFOW, SHGFI_ICON, SHGFI_LARGEICON};
use windows::Win32::UI::WindowsAndMessaging::{DestroyIcon, GetIconInfo, HICON, ICONINFO};

#[derive(Serialize, Default)]
pub struct FileInfo {
    path: String,
    name: String,
    size: u64,
    is_dir: bool,
    /// Explorer's icon for this file as a PNG data URL
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

#[allow(unsafe_op_in_unsafe_fn)]
unsafe fn hicon_to_png(icon: HICON) -> Option<Vec<u8>> {
    let mut info = ICONINFO::default();
    GetIconInfo(icon, &mut info).ok()?;

    let result = (|| {
        if info.hbmColor.is_invalid() {
            return None;
        }
        let mut bm = BITMAP::default();
        let got = GetObjectW(
            info.hbmColor.into(),
            size_of::<BITMAP>() as i32,
            Some(&mut bm as *mut BITMAP as *mut c_void),
        );
        if got == 0 || bm.bmWidth <= 0 || bm.bmHeight <= 0 {
            return None;
        }
        let (w, h) = (bm.bmWidth, bm.bmHeight);

        let mut bi = BITMAPINFO::default();
        bi.bmiHeader = BITMAPINFOHEADER {
            biSize: size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: w,
            biHeight: -h, // top-down
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0,
            ..Default::default()
        };
        let mut buf = vec![0u8; (w * h * 4) as usize];
        let hdc = GetDC(None);
        let lines = GetDIBits(
            hdc,
            info.hbmColor,
            0,
            h as u32,
            Some(buf.as_mut_ptr() as *mut c_void),
            &mut bi,
            DIB_RGB_COLORS,
        );
        ReleaseDC(None, hdc);
        if lines == 0 {
            return None;
        }

        // BGRA -> RGBA. Icons without an alpha channel come back all-zero alpha.
        let has_alpha = buf.chunks(4).any(|p| p[3] != 0);
        for p in buf.chunks_mut(4) {
            p.swap(0, 2);
            if !has_alpha {
                p[3] = 255;
            }
        }
        encode_png(&buf, w as u32, h as u32)
    })();

    let _ = DeleteObject(info.hbmColor.into());
    let _ = DeleteObject(info.hbmMask.into());
    result
}

fn icon_data_url(path: &str) -> Option<String> {
    unsafe {
        let wide: Vec<u16> = path.encode_utf16().chain(Some(0)).collect();
        let mut shfi = SHFILEINFOW::default();
        let r = SHGetFileInfoW(
            PCWSTR(wide.as_ptr()),
            FILE_FLAGS_AND_ATTRIBUTES(0),
            Some(&mut shfi),
            size_of::<SHFILEINFOW>() as u32,
            SHGFI_ICON | SHGFI_LARGEICON,
        );
        if r == 0 || shfi.hIcon.is_invalid() {
            return None;
        }
        let png = hicon_to_png(shfi.hIcon);
        let _ = DestroyIcon(shfi.hIcon);
        let b64 = base64::engine::general_purpose::STANDARD.encode(png?);
        Some(format!("data:image/png;base64,{b64}"))
    }
}

#[tauri::command(async)]
pub fn file_info(paths: Vec<String>) -> Vec<FileInfo> {
    // The shell wants a COM apartment; use a short-lived thread so we don't touch Tauri's.
    std::thread::spawn(move || {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        }
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
                    icon: icon_data_url(&path),
                    path,
                }
            })
            .collect()
    })
    .join()
    .unwrap_or_default()
}

/// Opens a file, folder or app with its default handler.
#[tauri::command]
pub fn open_path(path: String) {
    let _ = Command::new("explorer").arg(path).spawn();
}

#[tauri::command]
pub fn reveal_path(path: String) {
    let _ = Command::new("explorer").raw_arg(format!("/select,\"{path}\"")).spawn();
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
