//! The built-in brain, as the app uses it: commands for the webview, progress events, and a server that
//! stops by itself when it has not been used for a while. The work itself is in llm_core.rs.
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager};

use crate::llm_core::{self as core, Server};

static SERVER: Mutex<Option<Server>> = Mutex::new(None);
/// held while the brain is being downloaded or started, so two requests never do it twice
static BUSY: Mutex<()> = Mutex::new(());
static LAST_USED: Mutex<Option<Instant>> = Mutex::new(None);

/// The brain frees its memory after this long without a question; the next question starts it again.
const IDLE_STOP: Duration = Duration::from_secs(15 * 60);

#[derive(Serialize, Clone)]
struct Status {
    /// engine, model, starting or ready
    stage: &'static str,
    progress: f32,
    /// "gpu" or "cpu", once it is running
    device: String,
}

fn emit(app: &AppHandle, stage: &'static str, progress: f32, device: &str) {
    let _ = app.emit("llm-status", Status { stage, progress, device: device.to_string() });
}

fn root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_local_data_dir().map(|d| d.join("llm")).map_err(|e| e.to_string())
}

fn touch() {
    *LAST_USED.lock().unwrap() = Some(Instant::now());
    static WATCHER: OnceLock<()> = OnceLock::new();
    WATCHER.get_or_init(|| {
        std::thread::spawn(|| loop {
            std::thread::sleep(Duration::from_secs(60));
            let idle = LAST_USED.lock().unwrap().is_some_and(|t| t.elapsed() > IDLE_STOP);
            if idle {
                // a question in progress holds this lock, so it is never cut off
                if let Some(mut s) = SERVER.lock().unwrap().take() {
                    s.stop();
                }
            }
        });
    });
}

/// Makes the brain run on the chosen model, downloading and starting whatever is missing.
fn ensure_running(app: &AppHandle, choice: &str) -> Result<String, String> {
    let _building = BUSY.lock().unwrap();
    let spec = core::pick_model(choice, core::ram_gb());
    {
        let mut s = SERVER.lock().unwrap();
        if let Some(server) = s.as_mut() {
            if server.alive() && server.model_key == spec.key {
                touch();
                return Ok(server.device.clone());
            }
            server.stop();
        }
        *s = None;
    }
    let root = root(app)?;
    emit(app, "engine", 0.0, "");
    let exe = core::ensure_engine(&root, &|p| emit(app, "engine", p, ""))?;
    emit(app, "model", 0.0, "");
    let model = core::ensure_model(&root, &spec, &|p| emit(app, "model", p, ""))?;
    emit(app, "starting", 0.0, "");
    let server = core::start_server(&exe, &model, spec.key, spec.bytes, &|p| emit(app, "starting", p, ""))?;
    let device = server.device.clone();
    *SERVER.lock().unwrap() = Some(server);
    touch();
    emit(app, "ready", 1.0, &device);
    Ok(device)
}

/// Downloads (the first time) and starts the brain. Resolves with where it runs: "gpu" or "cpu".
#[tauri::command]
pub async fn llm_prepare(app: AppHandle, model: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || ensure_running(&app, &model)).await.map_err(|e| e.to_string())?
}

/// One answer from the brain. `messages` is the conversation with the system prompt first.
#[tauri::command]
pub async fn llm_chat(app: AppHandle, model: String, messages: Vec<Value>) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        for attempt in 0..2 {
            ensure_running(&app, &model)?;
            let mut guard = SERVER.lock().unwrap();
            let Some(server) = guard.as_mut() else { continue };
            match core::chat(server, &messages, 220) {
                Ok(text) => {
                    drop(guard);
                    touch();
                    return Ok(text);
                }
                Err(e) => {
                    // a server that has died is cleared, and the second attempt starts a fresh one
                    if !server.alive() {
                        *guard = None;
                        if attempt == 0 {
                            continue;
                        }
                    }
                    return Err(e);
                }
            }
        }
        Err("The brain isn't answering".into())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Is everything for this model already downloaded?
#[tauri::command]
pub fn llm_installed(app: AppHandle, model: String) -> bool {
    let Ok(root) = root(&app) else { return false };
    core::installed_engine(&root).is_some() && core::model_installed(&root, &core::pick_model(&model, core::ram_gb()))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmInfo {
    ram_gb: u64,
    /// which model "Automatic" means on this PC
    auto: &'static str,
}

#[tauri::command]
pub fn llm_info() -> LlmInfo {
    let ram = core::ram_gb();
    LlmInfo { ram_gb: ram, auto: core::pick_model("auto", ram).key }
}

/// Stops the brain (when the app closes).
pub fn shutdown() {
    if let Some(mut s) = SERVER.lock().unwrap().take() {
        s.stop();
    }
}
