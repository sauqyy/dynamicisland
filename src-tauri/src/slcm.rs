//! SLCM (slcm.ui.ac.id), UI's academic system: the study plan there holds each class's day, time
//! and room, which SCELE pages often leave out. SLCM signs in through UI's own login and has no
//! API for apps, so its study-plan schedule page is opened in a hidden window of the island's own.
//! When UI's login page comes up, the island fills in the SSO UI username and the password the user
//! just typed and submits it, once; the window is shown if anything else needs the user (a wrong
//! password, an extra step). A script in the window keeps the schedule the page loads for itself
//! (/course-plan/me/schedule and /classes) and hands it back by navigating to a made-up address,
//! which is caught and cancelled here. The password is kept only until it has been typed into the
//! login page (and wiped from memory then), and SLCM's tokens stay in the page; only the schedule
//! comes out. The window can only go to UI's own sites, over HTTPS.
//!
//! UI's login keeps its own session in the island's window storage, so a later reading usually
//! needs no password at all: `quiet` tries that first and, if the login page wants a password
//! after all, says so ("needs-password") instead of showing the window.
use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::webview::PageLoadEvent;
use tauri::{AppHandle, Emitter, Manager, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};
use zeroize::Zeroize;

const PAGE: &str = "https://slcm.ui.ac.id/akademik/course-plan/view-schedule";
const LABEL: &str = "slcm";
/// UI's login, where SLCM sends the browser to sign in.
const LOGIN_HOST: &str = "login.ui.ac.id";
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
    const p = fetch0.apply(window, arguments)
    if (url && WANT.test(url)) p.then((r) => r.ok && r.clone().text().then((t) => take(url, t))).catch(() => {})
    return p
  }
  const open0 = XMLHttpRequest.prototype.open
  XMLHttpRequest.prototype.open = function (method, url) {
    if (WANT.test(String(url))) this.addEventListener('load', () => this.status < 300 && take(url, this.responseText))
    return open0.apply(this, arguments)
  }
  const session = (k, v) => {
    try {
      if (v === undefined) return sessionStorage.getItem(k)
      sessionStorage.setItem(k, v)
    } catch {}
  }
  // SLCM's app is one large file its server sends slowly, and the connection sometimes drops
  // midway, which leaves the page blank: load it again, a few times
  setTimeout(() => {
    if (sent || document.getElementById('__nuxt')?.childElementCount) return
    const tries = Number(session('dynamic-island-reloads') || 0)
    if (tries < 3) {
      session('dynamic-island-reloads', String(tries + 1))
      location.reload()
    }
  }, 75000)
  // after signing in, SLCM may land on its home page: go on to the study-plan schedule, once
  setTimeout(() => {
    if (sent || got.schedule || location.pathname.includes('course-plan/view-schedule') || /[?&#](code|state)=/.test(location.href)) return
    if (!document.getElementById('__nuxt')?.childElementCount || session('dynamic-island-went')) return
    session('dynamic-island-went', '1')
    location.assign('https://slcm.ui.ac.id/akademik/course-plan/view-schedule')
  }, 6000)
})()"##;

/// The sign-in under way: the password until it is used, and how far the window has got.
struct Signin {
    username: String,
    password: Option<String>,
    /// trying UI's saved session: a login page that wants a password is reported, not shown
    quiet: bool,
    /// login pages loaded since the window opened
    logins: u32,
    /// pages loaded, to tell whether a submitted login went anywhere
    loads: u64,
}

static SIGNIN: Mutex<Option<Signin>> = Mutex::new(None);

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

/// How far the window has got, for the island to say: "loading", "signing-in", "needs-you".
fn status(app: &AppHandle, stage: &str) {
    let _ = app.emit("slcm-status", stage);
}

fn reveal(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(LABEL) {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
    status(app, "needs-you");
}

/// Fills UI's login form and submits it. A JSON string is a valid JavaScript string literal.
fn fill(window: &WebviewWindow, username: &str, password: &str) {
    let (Ok(u), Ok(p)) = (serde_json::to_string(username), serde_json::to_string(password)) else {
        return;
    };
    let _ = window.eval(&format!(
        r#"(() => {{
  const u = document.getElementById('username'), p = document.getElementById('password')
  if (!u || !p || !p.form) return
  u.value = {u}
  p.value = {p}
  for (const el of [u, p]) el.dispatchEvent(new Event('input', {{ bubbles: true }}))
  const b = p.form.querySelector('[name="login"]')
  b ? b.click() : p.form.submit()
}})()"#
    ));
}

/// A page finished loading in the SLCM window: sign in on UI's login page, once.
fn loaded(app: &AppHandle, window: &WebviewWindow, url: &Url) {
    let mut guard = SIGNIN.lock().unwrap_or_else(|e| e.into_inner());
    let Some(s) = guard.as_mut() else { return };
    s.loads += 1;
    if url.host_str() != Some(LOGIN_HOST) {
        status(app, "loading");
        return;
    }
    s.logins += 1;
    // no password to fill in while trying the saved session: ask for one (the window goes)
    if s.quiet && s.password.is_none() {
        drop(guard);
        status(app, "needs-password");
        if let Some(w) = app.get_webview_window(LABEL) {
            let _ = w.close();
        }
        return;
    }
    // the login page again after submitting it (a wrong password, an extra step), or no password
    // to fill in: the user takes it from here
    if s.logins != 1 || s.password.is_none() {
        // a password not used now isn't used later either: wiped
        if let Some(p) = s.password.as_mut() {
            p.zeroize();
        }
        s.password = None;
        drop(guard);
        reveal(app);
        return;
    }
    let mut password = s.password.take().unwrap_or_default();
    fill(window, &s.username, &password);
    // typed into the page: no longer needed here
    password.zeroize();
    status(app, "signing-in");
    // a login form that wasn't what we expected leaves the page where it is: show it
    let at = s.loads;
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(12));
        let stuck = SIGNIN.lock().unwrap_or_else(|e| e.into_inner()).as_ref().is_some_and(|s| s.loads == at);
        if stuck {
            reveal(&app);
        }
    });
}

/// The addresses the SLCM window may open: UI's own sites (slcm.ui.ac.id, login.ui.ac.id, …), over HTTPS.
fn allowed(url: &Url) -> bool {
    url.scheme() == "https" && url.host_str().is_some_and(|h| h == "ui.ac.id" || h.ends_with(".ui.ac.id"))
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

/// Opens SLCM's study-plan schedule in a hidden window and, with `password`, signs in to UI's
/// login with the verified SSO UI username. Progress arrives as "slcm-status", the schedule as
/// "slcm"; the window closing first sends "slcm-closed".
#[tauri::command]
pub async fn slcm_open(app: AppHandle, password: Option<String>, quiet: Option<bool>) -> Result<(), String> {
    let username = crate::sso::saved(&app).map(|s| s.username).unwrap_or_default();
    let password = password.filter(|p| !p.is_empty() && !username.is_empty());
    let quiet = quiet.unwrap_or(false) && password.is_none();
    if let Some(w) = app.get_webview_window(LABEL) {
        // already open: a password typed now is used on the login page it comes to next
        if let Some(s) = SIGNIN.lock().unwrap_or_else(|e| e.into_inner()).as_mut() {
            if password.is_some() {
                if let Some(old) = s.password.as_mut() {
                    old.zeroize();
                }
                s.password = password;
                s.logins = 0;
                s.quiet = false;
            }
        }
        let _ = w.set_focus();
        return Ok(());
    }
    *SIGNIN.lock().unwrap_or_else(|e| e.into_inner()) = Some(Signin { username, password, quiet, logins: 0, loads: 0 });

    let url = Url::parse(PAGE).map_err(|e| e.to_string())?;
    let nav = app.clone();
    let page = app.clone();
    let window = WebviewWindowBuilder::new(&app, LABEL, WebviewUrl::External(url))
        .title("SLCM · Dynamic Island is reading your class schedule")
        .inner_size(1000.0, 760.0)
        .center()
        .visible(false)
        .initialization_script(SCRIPT)
        .on_navigation(move |url| {
            if url.host_str() == Some(HANDBACK) {
                if let Some((_, d)) = url.query_pairs().find(|(k, _)| k == "d") {
                    handback(&nav, &d);
                }
                return false;
            }
            // only UI's own sites, over HTTPS: the window never follows a link or redirect elsewhere
            allowed(url)
        })
        .on_page_load(move |window, payload| {
            if matches!(payload.event(), PageLoadEvent::Finished) {
                loaded(&page, &window, payload.url());
            }
        })
        .build()
        .map_err(|e| e.to_string())?;
    status(&app, "loading");
    let handle = app.clone();
    window.on_window_event(move |e| {
        if let WindowEvent::Destroyed = e {
            // the password, if it was never used, goes with the window, wiped
            if let Some(mut s) = SIGNIN.lock().unwrap_or_else(|e| e.into_inner()).take() {
                if let Some(p) = s.password.as_mut() {
                    p.zeroize();
                }
            }
            let _ = handle.emit("slcm-closed", ());
        }
    });
    Ok(())
}

/// Shows the SLCM window, for when the user wants to see what it's doing.
#[tauri::command]
pub fn slcm_show(app: AppHandle) {
    reveal(&app);
}

/// Closes the SLCM window, giving up on this reading.
#[tauri::command]
pub fn slcm_cancel(app: AppHandle) {
    if let Some(w) = app.get_webview_window(LABEL) {
        let _ = w.close();
    }
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
