//! Battery and volume watchers.
use std::process::Command;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter};

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
    let out = Command::new("pmset").args(["-g", "batt"]).output().ok()?;
    let text = String::from_utf8_lossy(&out.stdout);
    // "-InternalBattery-0 (id=...)  87%; charging; 1:02 remaining ..." (desktop Macs have no such line)
    let line = text.lines().find(|l| l.contains('%'))?;
    let before = line.split('%').next()?;
    let digits: String = before.chars().rev().take_while(|c| c.is_ascii_digit()).collect::<Vec<_>>().into_iter().rev().collect();
    let percent: u8 = digits.parse().ok()?;
    let charging = text.contains("AC Power") && !line.contains("discharging");
    Some(Battery { percent: percent.min(100), charging })
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
            std::thread::sleep(Duration::from_secs(5));
        }
    });
}

fn read_volume() -> Option<Volume> {
    let out = Command::new("osascript")
        .args([
            "-e",
            "set v to get volume settings",
            "-e",
            "(output volume of v as text) & \",\" & (output muted of v as text)",
        ])
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&out.stdout);
    let (level, muted) = text.trim().split_once(',')?;
    // "missing value" for outputs without volume control (e.g. some HDMI displays)
    let level: u8 = level.trim().parse().ok()?;
    Some(Volume { level: level.min(100), muted: muted.trim() == "true" })
}

pub fn spawn_volume(app: AppHandle) {
    std::thread::spawn(move || {
        let mut last: Option<Volume> = None;
        loop {
            std::thread::sleep(Duration::from_millis(500));
            let Some(now) = read_volume() else { continue };
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

/// Brightness changes aren't observable without private APIs; not supported.
pub fn spawn_brightness(_app: AppHandle) {}

/// Reading Caps Lock needs the Input Monitoring permission on macOS; not supported.
pub fn spawn_lock_keys(_app: AppHandle) {}

/// macOS doesn't tell other apps which program is using the microphone or camera; not supported.
pub fn spawn_privacy(_app: AppHandle) {}
