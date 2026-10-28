//! SLCM (slcm.ui.ac.id), UI's academic system: the study plan there holds each class's day, time
//! and room, which SCELE pages often leave out. SLCM signs in through UI's own login and has no
//! API for apps, so its study-plan schedule page is opened in a window of the island's own. The
//! user signs in there as in a browser, and a script in that window keeps the schedule the page
//! loads for itself (/course-plan/me/schedule and /classes) and hands it back by navigating to a
//! made-up address, which is caught and cancelled here. The password and SLCM's tokens stay in the
//! page; only the schedule comes out.
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, Url, WebviewUrl, WebviewWindowBuilder, WindowEvent};

const PAGE: &str = "https://slcm.ui.ac.id/akademik/course-plan/view-schedule";
const LABEL: &str = "slcm";
/// Where the window's script sends the schedule; nothing is there, the navigation is only read.
const HANDBACK: &str = "dynamic-island.invalid";

/// Runs in every page of the SLCM window, before the page's own scripts.
const SCRIPT: &str = r##"(() => {
  if (location.hostname !== 'slcm.ui.ac.id' || window.__dynamicIsland) return
  window.__dynamicIsland = true
  const WANT = /\/course-plan\/me\/(schedule|classes)(?:[?#]|$)/
  const got = {}
  let sent = false
  let timer = 0
  const send = () => {
    if (sent || !got.schedule) return
    sent = true
    location.href = 'https://dynamic-island.invalid/slcm?d=' + encodeURIComponent(JSON.stringify(got))
  }
  const take = (url, body) => {
    const m = String(url).match(WANT)
    if (!m) return
    try {
      got[m[1]] = JSON.parse(body)
    } catch {
      return
    }
    if (got.schedule) {
      clearTimeout(timer)
      timer = setTimeout(send, got.classes ? 300 : 2500)
    }
  }
  const fetch0 = window.fetch
  window.fetch = function (input) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input && input.url
    const p = fetch0.apply(this, arguments)
    if (url && WANT.test(url)) p.then((r) => r.ok && r.clone().text().then((t) => take(url, t))).catch(() => {})
    return p
  }
  const open0 = XMLHttpRequest.prototype.open
  XMLHttpRequest.prototype.open = function (method, url) {
    if (WANT.test(String(url))) this.addEventListener('load', () => this.status < 300 && take(url, this.responseText))
    return open0.apply(this, arguments)
  }
  // after signing in, SLCM may land on its home page: go on to the study-plan schedule, once
  setTimeout(() => {
    if (sent || got.schedule || location.pathname.includes('course-plan/view-schedule') || /[?&#](code|state)=/.test(location.href)) return
    if (sessionStorage.getItem('dynamic-island-went')) return
    sessionStorage.setItem('dynamic-island-went', '1')
    location.assign('https://slcm.ui.ac.id/akademik/course-plan/view-schedule')
  }, 6000)
})()"##;

/// The page's responses as they came, read in the island (see slcm.ts).
#[derive(Clone, Serialize, Deserialize)]
pub struct Saved {
    schedule: Value,
    classes: Value,
    /// ms since the epoch
    at: u64,
}

fn path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("slcm.json"))
}

fn handback(app: &AppHandle, data: &str) {
    #[derive(Deserialize)]
    struct Got {
        schedule: Value,
        #[serde(default)]
        classes: Value,
    }
    let Ok(got) = serde_json::from_str::<Got>(data) else {
        return;
    };
    let saved = Saved {
        schedule: got.schedule,
        classes: got.classes,
        at: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0),
    };
    if let (Ok(p), Ok(json)) = (path(app), serde_json::to_string(&saved)) {
        let _ = std::fs::write(p, json);
    }
    let _ = app.emit("slcm", &saved);
    // closed once the navigation handler has returned
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(400));
        if let Some(w) = app.get_webview_window(LABEL) {
            let _ = w.close();
        }
    });
}

/// Opens SLCM's study-plan schedule. The schedule arrives as the "slcm" event; closing the window
/// first sends "slcm-closed".
#[tauri::command]
pub async fn slcm_open(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window(LABEL) {
        let _ = w.set_focus();
        return Ok(());
    }
    let url = Url::parse(PAGE).map_err(|e| e.to_string())?;
    let handle = app.clone();
    let window = WebviewWindowBuilder::new(&app, LABEL, WebviewUrl::External(url))
        .title("SLCM · sign in, and Dynamic Island reads your class schedule")
        .inner_size(1000.0, 760.0)
        .center()
        .initialization_script(SCRIPT)
        .on_navigation(move |url| {
            if url.host_str() != Some(HANDBACK) {
                return true;
            }
            if let Some((_, d)) = url.query_pairs().find(|(k, _)| k == "d") {
                handback(&handle, &d);
            }
            false
        })
        .build()
        .map_err(|e| e.to_string())?;
    let handle = app.clone();
    window.on_window_event(move |e| {
        if let WindowEvent::Destroyed = e {
            let _ = handle.emit("slcm-closed", ());
        }
    });
    Ok(())
}

/// The schedule last read from SLCM, if any.
#[tauri::command]
pub fn slcm_saved(app: AppHandle) -> Option<Saved> {
    serde_json::from_str(&std::fs::read_to_string(path(&app).ok()?).ok()?).ok()
}

#[tauri::command]
pub fn slcm_forget(app: AppHandle) {
    forget(&app);
}

pub fn forget(app: &AppHandle) {
    if let Ok(p) = path(app) {
        let _ = std::fs::remove_file(p);
    }
}
