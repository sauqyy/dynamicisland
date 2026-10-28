//! "Verify Student" with SSO UI (CAS 2.0 at sso.ui.ac.id/cas2, as used by ristekoss/SSO).
//! The system browser does the login and CAS redirects to a one-shot server on localhost with
//! a service ticket, which Rust checks with the CAS server itself. The password never touches
//! the app. A verified Fasilkom student unlocks the Campus (SCELE) pages.
use std::io::{Read, Write};
use std::net::TcpListener;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const CAS: &str = "https://sso.ui.ac.id/cas2";
const PORT: u16 = 53683;
/// Must be the same string for the login and the ticket check.
const SERVICE: &str = "http://127.0.0.1:53683/sso";

const DONE_PAGE: &str = "<!doctype html><meta charset=utf-8><title>Dynamic Island</title>\
<body style=\"font-family:Segoe UI,sans-serif;background:#111;color:#fff;display:grid;place-items:center;height:100vh;margin:0\">\
<div style=\"text-align:center\"><h2>SSO UI checked</h2><p style=\"opacity:.6\">You can close this tab and go back to Dynamic Island.</p></div>";

/// Fasilkom study programmes by SSO UI org code (`kd_org`), from ristekoss/SSO's additional-info.json.
/// The third part of the code is the faculty; 12 is Ilmu Komputer.
const FASILKOM: &[(&str, &str, &str)] = &[
    ("01.00.12.01", "Ilmu Komputer (Computer Science)", "S1 Reguler (Undergraduate Program)"),
    ("06.00.12.01", "Sistem Informasi (Information System)", "S1 Reguler (Undergraduate Program)"),
    ("07.00.12.01", "Sistem Informasi - Ekstensi (Information Systems - Ext)", "S1 Ekstensi (Extended Undergraduate Program)"),
    ("02.00.12.01", "Ilmu Komputer (Computer Science - Intl)", "S1 Kls Internasional (Intl. Class Undergraduate Program)"),
    ("03.00.12.01", "Ilmu Komputer (Computer Science)", "S2 (Graduate Program)"),
    ("04.00.12.01", "Teknologi Informasi (Information Technology)", "S2 (Graduate Program)"),
    ("05.00.12.01", "Ilmu Komputer (Computer Science)", "S3 (Doctoral Program)"),
    ("08.00.12.01", "Sistem Informasi (Information System)", "S1 Paralel (S1 Paralel)"),
    ("09.00.12.01", "Ilmu Komputer (Computer Science)", "S1 Paralel (S1 Paralel)"),
];

#[derive(Clone, Serialize, Deserialize)]
pub struct Student {
    pub username: String,
    pub name: String,
    pub npm: String,
    pub org_code: String,
    /// "mahasiswa", "staff", …
    pub role: String,
    pub study_program: String,
    pub educational_program: String,
    /// a Fasilkom UI student: the Campus pages are only for them
    pub fasilkom: bool,
    /// ms since the epoch
    pub verified_at: u64,
}

fn path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("sso.json"))
}

/// The verified student saved on this computer, if any.
pub fn saved(app: &AppHandle) -> Option<Student> {
    serde_json::from_str(&std::fs::read_to_string(path(app).ok()?).ok()?).ok()
}

fn unescape(s: &str) -> String {
    s.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&#039;", "'").replace("&apos;", "'").replace("&amp;", "&")
}

/// The text of `<cas:name>…</cas:name>` in the CAS answer.
fn tag(xml: &str, name: &str) -> Option<String> {
    let open = format!("<cas:{name}>");
    let start = xml.find(&open)? + open.len();
    let end = start + xml[start..].find(&format!("</cas:{name}>"))?;
    Some(unescape(xml[start..end].trim()))
}

/// Waits (up to 3 minutes) for CAS to send the browser back here and returns the service ticket.
fn wait_for_ticket(listener: &TcpListener) -> Result<String, String> {
    let started = Instant::now();
    loop {
        if started.elapsed() > Duration::from_secs(180) {
            return Err("SSO sign-in timed out".into());
        }
        let (mut stream, _) = match listener.accept() {
            Ok(c) => c,
            Err(_) => {
                std::thread::sleep(Duration::from_millis(100));
                continue;
            }
        };
        let _ = stream.set_nonblocking(false);
        let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
        let mut buf = [0u8; 4096];
        let n = stream.read(&mut buf).unwrap_or(0);
        let req = String::from_utf8_lossy(&buf[..n]);
        let target = req.lines().next().and_then(|l| l.split_whitespace().nth(1)).unwrap_or("");
        let ticket = target
            .strip_prefix("/sso?")
            .and_then(|q| q.split('&').find_map(|kv| kv.strip_prefix("ticket=")))
            .map(str::to_string);
        let body = if ticket.is_some() { DONE_PAGE } else { "<!doctype html><title>Dynamic Island</title>Waiting…" };
        let _ = write!(
            stream,
            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            body.len(),
            body
        );
        if let Some(t) = ticket {
            return Ok(t);
        }
        // e.g. a favicon request: keep waiting
    }
}

fn check_ticket(ticket: &str) -> Result<Student, String> {
    if !ticket.starts_with("ST-") || ticket.contains(['&', '#', ' ']) {
        return Err("SSO sent an unexpected ticket".into());
    }
    let xml = ureq::get(&format!("{CAS}/serviceValidate"))
        .query("ticket", ticket)
        .query("service", SERVICE)
        .timeout(Duration::from_secs(20))
        .call()
        .map_err(|_| "SSO UI is unreachable".to_string())?
        .into_string()
        .map_err(|_| "SSO UI is unreachable".to_string())?;
    let Some(username) = tag(&xml, "user") else {
        return Err("SSO UI didn't accept the sign-in".into());
    };
    let org_code = tag(&xml, "kd_org").unwrap_or_default();
    let role = tag(&xml, "peran_user").unwrap_or_default();
    let program = FASILKOM.iter().find(|(code, _, _)| *code == org_code);
    let fasilkom = role == "mahasiswa" && org_code.split('.').nth(2) == Some("12");
    Ok(Student {
        username,
        name: tag(&xml, "nama").unwrap_or_default(),
        npm: tag(&xml, "npm").unwrap_or_default(),
        org_code,
        role,
        study_program: program.map(|p| p.1.to_string()).unwrap_or_default(),
        educational_program: program.map(|p| p.2.to_string()).unwrap_or_default(),
        fasilkom,
        verified_at: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0),
    })
}

/// Opens SSO UI in the browser and returns who signed in. Only a Fasilkom student is saved.
#[tauri::command]
pub async fn sso_verify(app: AppHandle) -> Result<Student, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let listener = TcpListener::bind(("127.0.0.1", PORT)).map_err(|e| format!("port {PORT} is busy: {e}"))?;
        listener.set_nonblocking(true).map_err(|e| e.to_string())?;
        crate::auth::open_url(format!("{CAS}/login?service=http%3A%2F%2F127.0.0.1%3A{PORT}%2Fsso"))?;
        let ticket = wait_for_ticket(&listener)?;
        let student = check_ticket(&ticket)?;
        if student.fasilkom {
            std::fs::write(path(&app)?, serde_json::to_string(&student).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
        }
        Ok(student)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn sso_student(app: AppHandle) -> Option<Student> {
    saved(&app)
}

/// Forgets the verification, and with it the SCELE connection that depends on it.
#[tauri::command]
pub fn sso_forget(app: AppHandle) {
    if let Ok(p) = path(&app) {
        let _ = std::fs::remove_file(p);
    }
    crate::scele::forget_token(&app);
}
