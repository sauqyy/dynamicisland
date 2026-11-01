//! Keys for optional online services (the paid natural voice) live in the OS credential store, never in the
//! webview's storage or the synced settings, and the requests are made from here.
use std::io::Read;
use std::time::Duration;

use base64::Engine;
use serde_json::json;

const SERVICE: &str = "dynamic-island";

/// Keys that can be stored: "openai" (the optional natural voice).
fn account(kind: &str) -> &'static str {
    if kind == "openai" { "openai-api-key" } else { "anthropic-api-key" }
}

fn entry(kind: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, account(kind)).map_err(|e| e.to_string())
}

fn stored_key(kind: &str) -> Option<String> {
    entry(kind).ok()?.get_password().ok().filter(|k| !k.trim().is_empty())
}

#[tauri::command]
pub fn assistant_has_key(kind: String) -> bool {
    stored_key(&kind).is_some()
}

#[tauri::command]
pub fn assistant_set_key(key: String, kind: String) -> Result<(), String> {
    let key = key.trim();
    if key.is_empty() {
        return Err("The key is empty".into());
    }
    entry(&kind)?.set_password(key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn assistant_clear_key(kind: String) -> Result<(), String> {
    match entry(&kind)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}


/// Turns text into natural-sounding speech with OpenAI's text-to-speech and returns the mp3 as base64.
#[tauri::command]
pub async fn assistant_tts(text: String, voice: String, model: String) -> Result<String, String> {
    let key = stored_key("openai").ok_or_else(|| "Add your OpenAI key in Settings > Buddy to use the natural voice".to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut body = json!({ "model": model, "voice": voice, "input": text, "response_format": "mp3" });
        if model.starts_with("gpt-4o") {
            body["instructions"] = json!("Speak naturally and warmly, like a friendly person talking, with relaxed pacing.");
        }
        let result = ureq::post("https://api.openai.com/v1/audio/speech")
            .timeout(Duration::from_secs(30))
            .set("authorization", &format!("Bearer {key}"))
            .set("content-type", "application/json")
            .send_string(&body.to_string());
        match result {
            Ok(resp) => {
                let mut bytes = Vec::new();
                resp.into_reader().take(8 * 1024 * 1024).read_to_end(&mut bytes).map_err(|e| e.to_string())?;
                Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
            }
            Err(ureq::Error::Status(401 | 403, _)) => Err("OpenAI rejected that key. Check it in Settings > Buddy".into()),
            Err(ureq::Error::Status(429, _)) => Err("OpenAI voice is busy or out of credit".into()),
            Err(ureq::Error::Status(code, _)) => Err(format!("The voice service returned an error ({code})")),
            Err(_) => Err("I can't reach the voice service. Check your internet connection".into()),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Largest the log grows before it starts over.
const LOG_LIMIT: u64 = 256 * 1024;

/// Appends a line to a small log in the app's own data folder (not the shared temp folder: it can hold
/// what was said to the assistant), so a problem with the microphone or the voice can be looked at
/// afterwards (the webview's console is not easy to reach in the installed app). It starts over past
/// LOG_LIMIT, so old conversations don't pile up.
#[tauri::command]
pub fn assistant_log(app: tauri::AppHandle, line: String) {
    use std::io::Write;
    use tauri::Manager;
    let Ok(dir) = app.path().app_log_dir() else { return };
    let _ = std::fs::create_dir_all(&dir);
    let path = dir.join("assistant.log");
    if std::fs::metadata(&path).is_ok_and(|m| m.len() > LOG_LIMIT) {
        let _ = std::fs::remove_file(&path);
    }
    // the old log in the temp folder, from before it moved
    let _ = std::fs::remove_file(std::env::temp_dir().join("dynamic-island-assistant.log"));
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
        let secs = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
        let line: String = line.chars().take(400).map(|c| if c.is_control() { ' ' } else { c }).collect();
        let _ = writeln!(f, "[{}] {}", secs % 100_000, line);
    }
}
