//! Battery and volume watchers.
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
use windows::Win32::Media::Audio::{eMultimedia, eRender, IMMDeviceEnumerator, MMDeviceEnumerator};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED,
};
use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
use windows::Win32::UI::Input::KeyboardAndMouse::{GetKeyState, VK_CAPITAL, VK_NUMLOCK};
use winreg::enums::HKEY_CURRENT_USER;
use winreg::RegKey;

#[derive(Serialize, Clone, PartialEq)]
struct Battery {
    /// 0–100
    percent: u8,
    charging: bool,
}

#[derive(Serialize, Clone, PartialEq)]
struct Volume {
    /// 0–100
    level: u8,
    muted: bool,
}

fn read_battery() -> Option<Battery> {
    let mut s = SYSTEM_POWER_STATUS::default();
    unsafe { GetSystemPowerStatus(&mut s).ok()? };
    // 128 = no battery, 255 = unknown
    if s.BatteryFlag & 128 != 0 || s.BatteryLifePercent > 100 {
        return None;
    }
    Some(Battery { percent: s.BatteryLifePercent, charging: s.ACLineStatus == 1 })
}

pub fn spawn_battery(app: AppHandle) {
    std::thread::spawn(move || {
        let mut last: Option<Option<Battery>> = None;
        loop {
            let now = read_battery();
            if last.as_ref() != Some(&now) {
                let _ = app.emit("battery", &now);
                last = Some(now);
            }
            std::thread::sleep(Duration::from_secs(2));
        }
    });
}

fn endpoint() -> Option<IAudioEndpointVolume> {
    unsafe {
        let enumerator: IMMDeviceEnumerator =
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).ok()?;
        let device = enumerator.GetDefaultAudioEndpoint(eRender, eMultimedia).ok()?;
        device.Activate::<IAudioEndpointVolume>(CLSCTX_ALL, None).ok()
    }
}

pub fn spawn_volume(app: AppHandle) {
    std::thread::spawn(move || {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }
        let mut vol = endpoint();
        let mut last: Option<Volume> = None;
        let mut ticks = 0u32;
        loop {
            std::thread::sleep(Duration::from_millis(120));
            ticks += 1;
            // pick up output-device changes
            if vol.is_none() || ticks % 25 == 0 {
                vol = endpoint();
            }
            let Some(v) = &vol else { continue };
            let reading = unsafe { v.GetMasterVolumeLevelScalar().ok().zip(v.GetMute().ok()) };
            let Some((level, muted)) = reading else {
                vol = None;
                continue;
            };
            let now = Volume { level: (level * 100.0).round() as u8, muted: muted.as_bool() };
            // the first reading is just the starting state, not a change worth an alert
            if let Some(prev) = &last {
                if *prev != now {
                    let _ = app.emit("volume", &now);
                }
            }
            last = Some(now);
        }
    });
}

#[derive(Serialize, Clone, PartialEq)]
struct LockKeys {
    caps: bool,
    num: bool,
}

/// Emits when Caps Lock or Num Lock is toggled.
pub fn spawn_lock_keys(app: AppHandle) {
    std::thread::spawn(move || {
        let mut last: Option<LockKeys> = None;
        loop {
            std::thread::sleep(Duration::from_millis(150));
            let now = unsafe {
                LockKeys {
                    caps: GetKeyState(VK_CAPITAL.0 as i32) & 1 != 0,
                    num: GetKeyState(VK_NUMLOCK.0 as i32) & 1 != 0,
                }
            };
            // the first reading is only the starting state
            if let Some(prev) = &last {
                if *prev != now {
                    let _ = app.emit("lockkeys", &now);
                }
            }
            last = Some(now);
        }
    });
}

#[derive(Serialize, Clone, PartialEq)]
struct Privacy {
    /// name of the app using the microphone, if any
    mic: Option<String>,
    /// name of the app using the camera, if any
    camera: Option<String>,
}

/// Windows records capability use per app; a start time with no stop time means "in use now".
fn is_active(key: &RegKey) -> bool {
    let start: u64 = key.get_value("LastUsedTimeStart").unwrap_or(0);
    let stop: u64 = key.get_value("LastUsedTimeStop").unwrap_or(1);
    start > 0 && stop == 0
}

fn pretty_app_name(raw: &str) -> String {
    // desktop apps: "C:#Program Files#Foo#foo.exe", store apps: "Publisher.App_8wekyb3d8bbwe"
    let last = raw.rsplit(['#', '\\']).next().unwrap_or(raw);
    let last = last.split('_').next().unwrap_or(last);
    let last = last.trim_end_matches(".exe");
    last.rsplit('.').next().unwrap_or(last).to_string()
}

fn app_using(capability: &str) -> Option<String> {
    let base = format!(
        r"Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\{capability}"
    );
    let root = RegKey::predef(HKEY_CURRENT_USER).open_subkey(base).ok()?;
    for name in root.enum_keys().flatten() {
        if name == "NonPackaged" {
            if let Ok(np) = root.open_subkey("NonPackaged") {
                for n in np.enum_keys().flatten() {
                    if np.open_subkey(&n).map(|k| is_active(&k)).unwrap_or(false) {
                        return Some(pretty_app_name(&n));
                    }
                }
            }
        } else if root.open_subkey(&name).map(|k| is_active(&k)).unwrap_or(false) {
            return Some(pretty_app_name(&name));
        }
    }
    None
}

/// Emits which app (if any) is using the microphone or camera.
pub fn spawn_privacy(app: AppHandle) {
    std::thread::spawn(move || {
        let mut last: Option<Privacy> = None;
        loop {
            let now = Privacy { mic: app_using("microphone"), camera: app_using("webcam") };
            if last.as_ref() != Some(&now) {
                let _ = app.emit("privacy", &now);
                last = Some(now);
            }
            std::thread::sleep(Duration::from_secs(2));
        }
    });
}
