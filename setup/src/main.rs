// Prevents an extra console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::Command;

use tauri::AppHandle;

/// The regular Astra Isle installer, packed inside this setup program and run silently.
const PAYLOAD: &[u8] = include_bytes!("../payload/installer.exe");
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const DETACHED_PROCESS: u32 = 0x0000_0008;

/// The Universitas Indonesia build of Setup installs its own copy of the app, next to the regular one.
const UI_BUILD: bool = cfg!(feature = "ui");

fn install_dir() -> PathBuf {
    let name = if UI_BUILD { "Astra Isle UI" } else { "Astra Isle" };
    PathBuf::from(std::env::var("LOCALAPPDATA").unwrap_or_default()).join(name)
}

fn app_exe() -> PathBuf {
    install_dir().join("app.exe")
}

/// Closes a running copy of the app (only the one in the install folder) so it can be replaced.
fn close_running_app() {
    let script = format!(
        "Get-Process app -ErrorAction SilentlyContinue | Where-Object {{ $_.Path -eq '{}' }} | Stop-Process -Force",
        app_exe().display().to_string().replace('\'', "''")
    );
    let _ = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .creation_flags(CREATE_NO_WINDOW)
        .status();
}

#[tauri::command]
fn variant() -> &'static str {
    if UI_BUILD { "ui" } else { "main" }
}

#[tauri::command]
fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[tauri::command]
async fn install() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(|| {
        close_running_app();
        let payload = std::env::temp_dir().join("dynamic-island-setup-payload.exe");
        std::fs::write(&payload, PAYLOAD).map_err(|e| format!("Could not unpack the installer: {e}"))?;
        let status = Command::new(&payload)
            .arg("/S")
            .creation_flags(CREATE_NO_WINDOW)
            .status()
            .map_err(|e| format!("Could not start the installer: {e}"));
        let _ = std::fs::remove_file(&payload);
        if !status?.success() || !app_exe().exists() {
            return Err("Setup did not finish. Close other copies of Astra Isle and try again.".into());
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn launch(app: AppHandle) -> Result<(), String> {
    Command::new(app_exe())
        .creation_flags(DETACHED_PROCESS | CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| e.to_string())?;
    app.exit(0);
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![version, variant, install, launch])
        .run(tauri::generate_context!())
        .expect("error while running setup");
}
