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
    /// SSO UI vouched for the account but sent no faculty (its newer endpoints leave kd_org out):
    /// a SCELE sign-in with courses then confirms Fasilkom (see scele_login)
    #[serde(default)]
    pub needs_scele: bool,
    /// what SSO UI sent, shown when the faculty can't be confirmed
    #[serde(default)]
    pub detail: String,
    /// ms since the epoch
    pub verified_at: u64,
}

pub fn save(app: &AppHandle, s: &Student) -> Result<(), String> {
    std::fs::write(path(app)?, serde_json::to_string(s).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
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

/// The value of `key="…"` inside a tag.
fn attr_of(tag: &str, key: &str) -> Option<String> {
    let start = tag.find(&format!("{key}=\""))? + key.len() + 2;
    let end = start + tag[start..].find('"')?;
    Some(unescape(&tag[start..end]))
}

/// Every attribute in a successful CAS answer, lower-cased names. CAS servers send them either
/// as `<cas:name>value</cas:name>` or as `<cas:attribute name="…" value="…"/>`.
fn attributes(xml: &str) -> Vec<(String, String)> {
    let mut out = Vec::new();
    let mut rest = xml;
    while let Some(at) = rest.find("<cas:") {
        rest = &rest[at + 5..];
        let name_end = rest.find(|c: char| c == '>' || c == ' ' || c == '/').unwrap_or(rest.len());
        let name = &rest[..name_end];
        if name == "attribute" {
            let tag_end = rest.find('>').unwrap_or(rest.len());
            if let (Some(k), Some(v)) = (attr_of(&rest[..tag_end], "name"), attr_of(&rest[..tag_end], "value")) {
                out.push((k.to_lowercase(), v.trim().to_string()));
            }
            continue;
        }
        if matches!(name, "serviceResponse" | "authenticationSuccess" | "attributes" | "proxies" | "proxy" | "") {
            continue;
        }
        let close = format!("</cas:{name}>");
        if rest.as_bytes().get(name_end) == Some(&b'>') {
            if let Some(end) = rest.find(&close) {
                let value = &rest[name_end + 1..end];
                // a container (it has tags inside) is walked into instead
                if !value.contains("<cas:") {
                    out.push((name.to_lowercase(), unescape(value.trim())));
                    rest = &rest[end + close.len()..];
                }
            }
        }
    }
    out
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
    let attrs = attributes(&xml);
    let get = |k: &str| attrs.iter().find(|(n, _)| n == k).map(|(_, v)| v.clone()).unwrap_or_default();
    let org_code = get("kd_org");
    let role = get("peran_user");
    let program = FASILKOM.iter().find(|(code, _, _)| *code == org_code);

    // The faculty: from the org code ("01.00.12.01": the third part, 12, is Ilmu Komputer), or
    // any attribute that names it. Some(false) = SSO UI names another faculty.
    let parts: Vec<&str> = org_code.split('.').collect();
    let names_fasilkom = attrs.iter().any(|(_, v)| {
        let v = v.to_lowercase();
        v.contains("ilmu komputer") || v.contains("fasilkom") || v.contains("computer science")
    });
    let faculty = if parts.len() == 4 { Some(parts[2] == "12") } else if names_fasilkom { Some(true) } else { None };
    // a student: the role says so, or there is an NPM. The NPM counts even beside another role:
    // SSO UI gives students who also hold a position (e.g. teaching assistants) peran_user=staff.
    let student = role.to_lowercase().contains("mahasiswa") || !get("npm").is_empty();

    let fasilkom = faculty == Some(true) && student;
    // nothing contradicts it, SSO UI just didn't say: let SCELE (Fasilkom's own) confirm it
    let needs_scele = !fasilkom && faculty != Some(false);
    let names: Vec<&str> = attrs.iter().map(|(n, _)| n.as_str()).collect();
    let detail = format!(
        "SSO UI sent {}{}{}",
        if names.is_empty() { "no attributes".to_string() } else { format!("attributes: {}", names.join(", ")) },
        if role.is_empty() { String::new() } else { format!(" · peran_user={role}") },
        if org_code.is_empty() { String::new() } else { format!(" · kd_org={org_code}") },
    );
    Ok(Student {
        username,
        name: get("nama"),
        npm: get("npm"),
        org_code,
        role,
        study_program: program.map(|p| p.1.to_string()).unwrap_or_default(),
        educational_program: program.map(|p| p.2.to_string()).unwrap_or_default(),
        fasilkom,
        needs_scele,
        detail,
        verified_at: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0),
    })
}

/// Opens SSO UI in the browser and returns who signed in. A Fasilkom student is saved, and so is
/// one SSO UI didn't give a faculty for, until SCELE confirms it; anyone else is not.
#[tauri::command]
pub async fn sso_verify(app: AppHandle) -> Result<Student, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let listener = TcpListener::bind(("127.0.0.1", PORT)).map_err(|e| format!("port {PORT} is busy: {e}"))?;
        listener.set_nonblocking(true).map_err(|e| e.to_string())?;
        crate::auth::open_url(format!("{CAS}/login?service=http%3A%2F%2F127.0.0.1%3A{PORT}%2Fsso"))?;
        let ticket = wait_for_ticket(&listener)?;
        let student = check_ticket(&ticket)?;
        if student.fasilkom || student.needs_scele {
            save(&app, &student)?;
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
