//! Speech-to-text is only wired up on Windows so far.

#[tauri::command]
pub async fn speech_prepare() -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub async fn speech_start() -> Result<(), String> {
    Err("Speech recognition isn't available on this system yet".into())
}

#[tauri::command]
pub async fn speech_stop() -> Result<(), String> {
    Ok(())
}
