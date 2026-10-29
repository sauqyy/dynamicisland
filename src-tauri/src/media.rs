//! Now-playing data from the Windows media session (Spotify, browsers, VLC, ...).
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use base64::Engine;
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use windows::Media::Control::{
    GlobalSystemMediaTransportControlsSession as Session,
    GlobalSystemMediaTransportControlsSessionManager as Manager,
    GlobalSystemMediaTransportControlsSessionMediaProperties as Props,
    GlobalSystemMediaTransportControlsSessionPlaybackStatus as Status,
};
use windows::Storage::Streams::DataReader;
use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};

/// Seconds between 1601-01-01 (Windows epoch) and 1970-01-01.
const EPOCH_DIFF: f64 = 11_644_473_600.0;

#[derive(Serialize, Clone, PartialEq)]
struct MediaInfo {
    id: String,
    title: String,
    artist: String,
    album: String,
    playing: bool,
    /// seconds, already extrapolated to "now"
    position: f64,
    duration: f64,
}

#[derive(Serialize, Clone)]
struct MediaArt {
    id: String,
    data_url: String,
}

fn current_session() -> Option<Session> {
    Manager::RequestAsync().ok()?.join().ok()?.GetCurrentSession().ok()
}

fn read_info(session: &Session, props: &Props) -> Option<MediaInfo> {
    let title = props.Title().ok()?.to_string();
    if title.is_empty() {
        return None;
    }
    let mut artist = props.Artist().map(|s| s.to_string()).unwrap_or_default();
    let mut album = props.AlbumTitle().map(|s| s.to_string()).unwrap_or_default();
    // Apple Music (and iTunes) report "Artist — Album" as the artist and leave the album empty,
    // which would make every lyrics lookup miss.
    let source = session.SourceAppUserModelId().map(|s| s.to_string()).unwrap_or_default();
    if album.is_empty() && (source.contains("AppleMusic") || source.contains("iTunes")) {
        if let Some((a, b)) = artist.split_once(" \u{2014} ") {
            (artist, album) = (a.trim().to_string(), b.trim().to_string());
        }
    }
    let playing = session
        .GetPlaybackInfo()
        .and_then(|i| i.PlaybackStatus())
        .map(|s| s == Status::Playing)
        .unwrap_or(false);

    let tl = session.GetTimelineProperties().ok()?;
    let secs = |t: windows::Foundation::TimeSpan| t.Duration as f64 / 1e7;
    let start = tl.StartTime().map(secs).unwrap_or(0.0);
    let end = tl.EndTime().map(secs).unwrap_or(0.0);
    let mut position = tl.Position().map(secs).unwrap_or(0.0) - start;
    if playing {
        // Position is only valid as of LastUpdatedTime, so advance it to now.
        if let Ok(updated) = tl.LastUpdatedTime() {
            let updated = updated.UniversalTime as f64 / 1e7 - EPOCH_DIFF;
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_secs_f64())
                .unwrap_or(updated);
            position += (now - updated).clamp(0.0, 60.0);
        }
    }
    let duration = (end - start).max(0.0);
    let max = if duration > 0.0 { duration } else { f64::MAX };
    Some(MediaInfo {
        id: format!("{artist}\u{1f}{title}"),
        title,
        artist,
        album,
        playing,
        position: position.clamp(0.0, max),
        duration,
    })
}

fn read_art(props: &Props) -> Option<String> {
    let stream = props.Thumbnail().ok()?.OpenReadAsync().ok()?.join().ok()?;
    let size = stream.Size().ok()? as u32;
    if size == 0 || size > 8_000_000 {
        return None;
    }
    let reader = DataReader::CreateDataReader(&stream.GetInputStreamAt(0).ok()?).ok()?;
    reader.LoadAsync(size).ok()?.join().ok()?;
    let mut buf = vec![0u8; size as usize];
    reader.ReadBytes(&mut buf).ok()?;
    let mime = stream
        .ContentType()
        .map(|s| s.to_string())
        .ok()
        .filter(|m| !m.is_empty())
        .unwrap_or_else(|| "image/jpeg".into());
    let b64 = base64::engine::general_purpose::STANDARD.encode(buf);
    Some(format!("data:{mime};base64,{b64}"))
}

pub fn spawn(app: AppHandle) {
    std::thread::spawn(move || {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }
        let mut last: Option<MediaInfo> = None;
        let mut art_id = String::new();
        let mut art_tries = 0;
        let mut ticks = 0u32;
        loop {
            std::thread::sleep(Duration::from_millis(500));
            ticks += 1;

            let session = current_session();
            let props = session
                .as_ref()
                .and_then(|s| s.TryGetMediaPropertiesAsync().ok()?.join().ok());
            let info = session
                .as_ref()
                .zip(props.as_ref())
                .and_then(|(s, p)| read_info(s, p));

            // Send on change, plus a periodic resync so the UI clock can't drift.
            let changed = match (&info, &last) {
                (Some(a), Some(b)) => {
                    a.id != b.id
                        || a.playing != b.playing
                        || (a.position - b.position).abs() > 2.5
                        || a.duration != b.duration
                }
                (None, None) => false,
                _ => true,
            };
            if changed || ticks % 6 == 0 {
                let _ = app.emit("media", &info);
            }

            if let (Some(i), Some(p)) = (&info, &props) {
                if art_id != i.id {
                    art_id = i.id.clone();
                    art_tries = 0;
                }
                if art_tries < 8 {
                    art_tries += 1;
                    if let Some(data_url) = read_art(p) {
                        art_tries = 99;
                        let _ = app.emit("media-art", MediaArt { id: i.id.clone(), data_url });
                    }
                }
            }
            last = info;
        }
    });
}

fn with_session(f: impl FnOnce(Session) + Send + 'static) {
    std::thread::spawn(move || {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }
        if let Some(s) = current_session() {
            f(s);
        }
    });
}

#[tauri::command]
pub fn media_toggle() {
    with_session(|s| {
        let _ = s.TryTogglePlayPauseAsync().and_then(|a| a.join());
    });
}

#[tauri::command]
pub fn media_next() {
    with_session(|s| {
        let _ = s.TrySkipNextAsync().and_then(|a| a.join());
    });
}

#[tauri::command]
pub fn media_prev() {
    with_session(|s| {
        let _ = s.TrySkipPreviousAsync().and_then(|a| a.join());
    });
}

#[tauri::command]
pub fn media_seek(seconds: f64) {
    with_session(move |s| {
        let start = s
            .GetTimelineProperties()
            .and_then(|t| t.StartTime())
            .map(|t| t.Duration)
            .unwrap_or(0);
        let _ = s
            .TryChangePlaybackPositionAsync(start + (seconds * 1e7) as i64)
            .and_then(|a| a.join());
    });
}
