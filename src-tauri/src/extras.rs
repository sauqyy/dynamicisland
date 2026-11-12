//! Bluetooth devices, mirrored toasts, new screenshots and calendar downloads.
use std::collections::HashSet;
use std::path::PathBuf;
use std::time::{Duration, SystemTime};

use serde::Serialize;
use tauri::{AppHandle, Emitter};

/// Downloads a text file (a calendar feed) over https.
#[tauri::command]
pub async fn fetch_text(url: String) -> Result<String, String> {
    if !url.starts_with("https://") || url.contains(['"', '\'', '`', '\n', '\r', ' ']) {
        return Err("unsupported url".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let res = ureq::get(&url)
            .timeout(Duration::from_secs(15))
            .call()
            .map_err(|e| e.to_string())?;
        // feeds can be large, but never more than a few MB of text
        let mut body = String::new();
        std::io::Read::read_to_string(&mut std::io::Read::take(res.into_reader(), 6_000_000), &mut body)
            .map_err(|e| e.to_string())?;
        Ok(body)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Serialize, Clone, PartialEq)]
pub struct BtDevice {
    name: String,
    /// 0-100 when the device reports it
    battery: Option<u8>,
}

#[cfg(windows)]
#[derive(Serialize, Clone)]
struct Toast {
    app: String,
    title: String,
    body: String,
}

#[derive(Serialize, Clone)]
struct Screenshot {
    path: String,
}

// ---- screenshots ----------------------------------------------------------------------------

fn screenshot_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    #[cfg(windows)]
    if let Ok(home) = std::env::var("USERPROFILE") {
        let home = PathBuf::from(home);
        dirs.push(home.join("Pictures").join("Screenshots"));
        dirs.push(home.join("OneDrive").join("Pictures").join("Screenshots"));
    }
    #[cfg(target_os = "macos")]
    if let Ok(home) = std::env::var("HOME") {
        dirs.push(PathBuf::from(home).join("Desktop"));
    }
    dirs
}

fn is_screenshot(name: &str) -> bool {
    let lower = name.to_lowercase();
    if !(lower.ends_with(".png") || lower.ends_with(".jpg") || lower.ends_with(".jpeg")) {
        return false;
    }
    // the Desktop is full of other pictures on macOS
    cfg!(windows) || lower.starts_with("screenshot") || lower.starts_with("screen shot")
}

/// Emits `screenshot` with the file's path when the Snipping Tool or macOS saves a new one.
pub fn spawn_screenshots(app: AppHandle) {
    std::thread::spawn(move || {
        let dirs = screenshot_dirs();
        let mut seen: HashSet<PathBuf> = HashSet::new();
        let mut first = true;
        loop {
            for dir in &dirs {
                let Ok(rd) = std::fs::read_dir(dir) else { continue };
                for entry in rd.flatten() {
                    let path = entry.path();
                    if seen.contains(&path) || !is_screenshot(&entry.file_name().to_string_lossy()) {
                        continue;
                    }
                    let Ok(meta) = entry.metadata() else { continue };
                    // files that were already there when the app started are not new
                    if !first {
                        // still being written
                        let settled = meta
                            .modified()
                            .ok()
                            .and_then(|m| SystemTime::now().duration_since(m).ok())
                            .map(|d| d > Duration::from_millis(800))
                            .unwrap_or(false);
                        if !settled {
                            continue;
                        }
                    }
                    seen.insert(path.clone());
                    if !first {
                        let _ = app.emit("screenshot", Screenshot { path: path.to_string_lossy().into_owned() });
                    }
                }
            }
            first = false;
            std::thread::sleep(Duration::from_millis(1200));
        }
    });
}

// ---- toasts and Bluetooth: Windows only -----------------------------------------------------

#[cfg(not(windows))]
pub fn spawn_bluetooth(_app: AppHandle) {}

#[cfg(not(windows))]
pub fn spawn_notifications(_app: AppHandle) {}

#[cfg(windows)]
pub use win::{spawn_bluetooth, spawn_notifications};

#[cfg(windows)]
mod win {
    use super::*;
    use rusqlite::{Connection, OpenFlags};
    use windows::core::{GUID, PCWSTR};
    use windows::Win32::Devices::DeviceAndDriverInstallation::{
        SetupDiDestroyDeviceInfoList, SetupDiEnumDeviceInfo, SetupDiGetClassDevsW, SetupDiGetDeviceInstanceIdW,
        SetupDiGetDevicePropertyW, HDEVINFO, DIGCF_PRESENT, SP_DEVINFO_DATA,
    };
    use windows::Win32::Devices::Properties::DEVPROPTYPE;
    use windows::Win32::Foundation::DEVPROPKEY;

    const GUID_BLUETOOTH_CLASS: GUID = GUID::from_u128(0xe0cbf06c_cd8b_4647_bb8a_263b43f0f974);
    const KEY_FRIENDLY_NAME: DEVPROPKEY = DEVPROPKEY {
        fmtid: GUID::from_u128(0xa45c254e_df1c_4efd_8020_67d146a850e0),
        pid: 14,
    };
    const KEY_IS_CONNECTED: DEVPROPKEY = DEVPROPKEY {
        fmtid: GUID::from_u128(0x83da6326_97a6_4088_9453_a1923f573b29),
        pid: 15,
    };
    const KEY_BATTERY: DEVPROPKEY = DEVPROPKEY {
        fmtid: GUID::from_u128(0x104ea319_6ee2_4701_bd47_8ddbf425bbe5),
        pid: 2,
    };

    unsafe fn prop(set: HDEVINFO, info: &SP_DEVINFO_DATA, key: &DEVPROPKEY) -> Option<Vec<u8>> {
        let mut ty = DEVPROPTYPE(0);
        let mut buf = vec![0u8; 512];
        let mut need = 0u32;
        unsafe {
            SetupDiGetDevicePropertyW(set, info, key, &mut ty, Some(&mut buf), Some(&mut need), 0).ok()?;
        }
        buf.truncate((need as usize).min(512));
        Some(buf)
    }

    fn connected_devices() -> Vec<BtDevice> {
        let mut out: Vec<BtDevice> = Vec::new();
        unsafe {
            let Ok(set) = SetupDiGetClassDevsW(Some(&GUID_BLUETOOTH_CLASS), PCWSTR::null(), None, DIGCF_PRESENT)
            else {
                return out;
            };
            let mut i = 0;
            loop {
                let mut info = SP_DEVINFO_DATA { cbSize: size_of::<SP_DEVINFO_DATA>() as u32, ..Default::default() };
                if SetupDiEnumDeviceInfo(set, i, &mut info).is_err() {
                    break;
                }
                i += 1;
                // only the device node itself, not its services
                let mut id = [0u16; 256];
                if SetupDiGetDeviceInstanceIdW(set, &info, Some(&mut id), None).is_err() {
                    continue;
                }
                let id = String::from_utf16_lossy(&id).trim_end_matches('\0').to_uppercase();
                if !(id.starts_with("BTHENUM\\DEV_") || id.starts_with("BTHLE\\DEV_")) {
                    continue;
                }
                if prop(set, &info, &KEY_IS_CONNECTED).and_then(|b| b.first().copied()).unwrap_or(0) == 0 {
                    continue;
                }
                let name = prop(set, &info, &KEY_FRIENDLY_NAME)
                    .map(|b| {
                        let u: Vec<u16> = b.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect();
                        String::from_utf16_lossy(&u).trim_end_matches('\0').to_string()
                    })
                    .unwrap_or_default();
                if name.is_empty() {
                    continue;
                }
                let battery = prop(set, &info, &KEY_BATTERY).and_then(|b| b.first().copied()).filter(|v| *v <= 100);
                out.push(BtDevice { name, battery });
            }
            let _ = SetupDiDestroyDeviceInfoList(set);
        }
        out.sort_by(|a, b| a.name.cmp(&b.name));
        out.dedup_by(|a, b| a.name == b.name);
        out
    }

    /// Emits `bluetooth` with every connected device and its battery whenever that changes.
    pub fn spawn_bluetooth(app: AppHandle) {
        std::thread::spawn(move || {
            let mut last: Option<Vec<BtDevice>> = None;
            loop {
                let now = connected_devices();
                if last.as_ref() != Some(&now) {
                    let _ = app.emit("bluetooth", &now);
                    last = Some(now);
                }
                std::thread::sleep(Duration::from_secs(5));
            }
        });
    }

    fn xml_unescape(s: &str) -> String {
        s.replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&quot;", "\"")
            .replace("&apos;", "'")
            .replace("&amp;", "&")
    }

    /// The `<text>` lines of a toast, in order: title first, then the body.
    fn toast_texts(xml: &str) -> Vec<String> {
        let mut out = Vec::new();
        let mut rest = xml;
        while let Some(open) = rest.find("<text") {
            let after = &rest[open + 5..];
            // `<text ...>` and not `<textBox`
            if !after.starts_with(['>', ' ']) {
                rest = after;
                continue;
            }
            let Some(gt) = after.find('>') else { break };
            if after[..gt].ends_with('/') {
                rest = &after[gt..];
                continue;
            }
            let body = &after[gt + 1..];
            let Some(close) = body.find("</text>") else { break };
            let t = xml_unescape(body[..close].trim());
            if !t.is_empty() {
                out.push(t);
            }
            rest = &body[close..];
        }
        out
    }

    /// "Microsoft.WindowsTerminal_8wekyb3d8bbwe!App" or "Chrome" -> "WindowsTerminal" / "Chrome"
    fn app_name(primary: &str) -> String {
        let id = primary.split('!').next().unwrap_or(primary);
        let id = id.split('_').next().unwrap_or(id);
        let id = id.trim_end_matches(".exe");
        id.rsplit(['.', '\\', '/']).next().unwrap_or(id).to_string()
    }

    fn db_path() -> Option<PathBuf> {
        let local = std::env::var("LOCALAPPDATA").ok()?;
        Some(PathBuf::from(local).join("Microsoft").join("Windows").join("Notifications").join("wpndatabase.db"))
    }

    fn newest_order(db: &Connection) -> i64 {
        db.query_row("SELECT COALESCE(MAX(\"Order\"), 0) FROM Notification", [], |r| r.get(0)).unwrap_or(0)
    }

    /// Emits `notification` for each toast Windows shows. The notification centre keeps them in a
    /// local database; this only reads it.
    pub fn spawn_notifications(app: AppHandle) {
        std::thread::spawn(move || {
            let Some(path) = db_path() else { return };
            let mut last: Option<i64> = None;
            loop {
                std::thread::sleep(Duration::from_millis(1500));
                let Ok(db) = Connection::open_with_flags(&path, OpenFlags::SQLITE_OPEN_READ_ONLY) else { continue };
                let newest = newest_order(&db);
                // the first look only sets the starting point; a smaller number means the list was reset
                let Some(prev) = last.filter(|p| *p <= newest) else {
                    last = Some(newest);
                    continue;
                };
                if newest == prev {
                    continue;
                }
                let Ok(mut st) = db.prepare(
                    "SELECT n.\"Order\", n.Payload, h.PrimaryId FROM Notification n \
                     JOIN NotificationHandler h ON n.HandlerId = h.RecordId \
                     WHERE n.\"Order\" > ?1 ORDER BY n.\"Order\" LIMIT 10",
                ) else {
                    continue;
                };
                let rows = st.query_map([prev], |r| {
                    Ok((r.get::<_, i64>(0)?, r.get::<_, Option<Vec<u8>>>(1)?, r.get::<_, String>(2)?))
                });
                if let Ok(rows) = rows {
                    for (_, payload, primary) in rows.flatten() {
                        let Some(payload) = payload else { continue };
                        let xml = String::from_utf8_lossy(&payload);
                        let mut texts = toast_texts(&xml).into_iter();
                        let Some(title) = texts.next() else { continue };
                        let body = texts.collect::<Vec<_>>().join(" ");
                        let _ = app.emit("notification", Toast { app: app_name(&primary), title, body });
                    }
                }
                last = Some(newest);
            }
        });
    }
}
