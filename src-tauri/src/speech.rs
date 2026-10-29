//! Live speech-to-text for the assistant, from the Windows speech recognizer.
//!
//! The recognizer takes a few seconds to get ready (it compiles its dictation grammar), so it is built once,
//! ahead of time (`speech_prepare`), and reused. `speech_start` then opens a continuous dictation session and
//! streams what it hears to the webview: `speech-hypothesis` (the phrase being said right now, still changing)
//! and `speech-result` (a phrase Windows is sure of). `speech_stop` ends the session.
use std::sync::Mutex;

use tauri::{AppHandle, Emitter};
use windows::core::{Interface, HSTRING};
use windows::Foundation::TypedEventHandler;
use windows::Media::SpeechRecognition::{
    ISpeechRecognitionConstraint, SpeechContinuousRecognitionResultGeneratedEventArgs, SpeechContinuousRecognitionSession,
    SpeechRecognitionHypothesisGeneratedEventArgs, SpeechRecognitionResultStatus, SpeechRecognitionScenario,
    SpeechRecognitionTopicConstraint, SpeechRecognizer,
};
use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};

static RECOGNIZER: Mutex<Option<SpeechRecognizer>> = Mutex::new(None);
/// held while a recognizer is being built, so two callers never build two
static BUILDING: Mutex<()> = Mutex::new(());

/// What Windows says when "Online speech recognition" is switched off in Settings.
const SPEECH_POLICY_OFF: i32 = 0x80045509u32 as i32;

fn describe(e: &windows::core::Error) -> String {
    match e.code().0 {
        SPEECH_POLICY_OFF => "Turn on Online speech recognition in Windows Settings > Privacy > Speech".into(),
        // E_ACCESSDENIED: microphone privacy setting
        -2147024891 => "Allow microphone access for desktop apps in Windows Settings > Privacy > Microphone".into(),
        _ => format!("Speech recognition failed ({})", e.message().trim()),
    }
}

fn build(app: &AppHandle) -> windows::core::Result<SpeechRecognizer> {
    let recognizer = SpeechRecognizer::new()?;
    let constraint = SpeechRecognitionTopicConstraint::Create(SpeechRecognitionScenario::Dictation, &HSTRING::new())?;
    recognizer.Constraints()?.Append(&constraint.cast::<ISpeechRecognitionConstraint>()?)?;
    let compiled = recognizer.CompileConstraintsAsync()?.join()?;
    if compiled.Status()? != SpeechRecognitionResultStatus::Success {
        return Err(windows::core::Error::from(windows::core::HRESULT(SPEECH_POLICY_OFF)));
    }

    let a = app.clone();
    recognizer.HypothesisGenerated(&TypedEventHandler::<SpeechRecognizer, SpeechRecognitionHypothesisGeneratedEventArgs>::new(move |_, args| {
        if let Some(args) = args.as_ref() {
            if let Ok(h) = args.Hypothesis().and_then(|h| h.Text()) {
                let _ = a.emit("speech-hypothesis", h.to_string());
            }
        }
        Ok(())
    }))?;

    let a = app.clone();
    recognizer.ContinuousRecognitionSession()?.ResultGenerated(&TypedEventHandler::<
        SpeechContinuousRecognitionSession,
        SpeechContinuousRecognitionResultGeneratedEventArgs,
    >::new(move |_, args| {
        if let Some(args) = args.as_ref() {
            if let Ok(r) = args.Result() {
                let ok = r.Status().map(|s| s == SpeechRecognitionResultStatus::Success).unwrap_or(false);
                let text = r.Text().map(|t| t.to_string()).unwrap_or_default();
                if ok && !text.trim().is_empty() {
                    let _ = a.emit("speech-result", text);
                }
            }
        }
        Ok(())
    }))?;
    Ok(recognizer)
}

/// The shared recognizer, built the first time it is asked for.
fn recognizer(app: &AppHandle) -> windows::core::Result<SpeechRecognizer> {
    let _building = BUILDING.lock().unwrap();
    if let Some(r) = RECOGNIZER.lock().unwrap().clone() {
        return Ok(r);
    }
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
    }
    let r = build(app)?;
    *RECOGNIZER.lock().unwrap() = Some(r.clone());
    Ok(r)
}

/// Gets the recognizer ready in the background, so the first time you talk there is no wait.
#[tauri::command]
pub async fn speech_prepare(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || recognizer(&app).map(|_| ()).map_err(|e| describe(&e)))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn speech_start(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let r = recognizer(&app).map_err(|e| describe(&e))?;
        let session = r.ContinuousRecognitionSession().map_err(|e| describe(&e))?;
        // a session left running by an earlier run would make the start below fail
        let _ = session.StopAsync().and_then(|op| op.join());
        session.StartAsync().and_then(|op| op.join()).map_err(|e| {
            // start fresh next time rather than keep a recognizer that is in a bad state
            *RECOGNIZER.lock().unwrap() = None;
            describe(&e)
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Ends the session; phrases Windows was still working on are delivered as `speech-result` first.
#[tauri::command]
pub async fn speech_stop() -> Result<(), String> {
    let r = RECOGNIZER.lock().unwrap().clone();
    if let Some(r) = r {
        tauri::async_runtime::spawn_blocking(move || {
            if let Ok(s) = r.ContinuousRecognitionSession() {
                let _ = s.StopAsync().and_then(|op| op.join());
            }
        })
        .await
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}
