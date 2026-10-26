//! Sign-in with Google: the system browser does the login and redirects to a tiny
//! one-shot server on localhost, which hands the authorization code back to the app.
use std::io::{Read, Write};
use std::net::TcpListener;
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::time::{Duration, Instant};

/// Must be listed in the Supabase "Redirect URLs".
pub const OAUTH_PORT: u16 = 53682;

const DONE_PAGE: &str = "<!doctype html><meta charset=utf-8><title>Dynamic Island</title>\
<body style=\"font-family:Segoe UI,sans-serif;background:#111;color:#fff;display:grid;place-items:center;height:100vh;margin:0\">\
<div style=\"text-align:center\"><h2>You're signed in</h2><p style=\"opacity:.6\">You can close this tab and go back to Dynamic Island.</p></div>";

/// Waits (up to 3 minutes) for the browser to be redirected here and returns the `code` query value.
#[tauri::command]
pub async fn oauth_wait() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let listener = TcpListener::bind(("127.0.0.1", OAUTH_PORT)).map_err(|e| format!("port {OAUTH_PORT} is busy: {e}"))?;
        listener.set_nonblocking(true).map_err(|e| e.to_string())?;
        let started = Instant::now();
        loop {
            if started.elapsed() > Duration::from_secs(180) {
                return Err("sign-in timed out".to_string());
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
            let query = target.split_once('?').map(|(_, q)| q).unwrap_or("");
            let find = |key: &str| {
                query
                    .split('&')
                    .find_map(|kv| kv.split_once('=').filter(|(k, _)| *k == key).map(|(_, v)| v.to_string()))
            };
            let body = if find("code").is_some() { DONE_PAGE } else { "<!doctype html><title>Dynamic Island</title>Waiting…" };
            let _ = write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            if let Some(code) = find("code") {
                return Ok(code);
            }
            if let Some(err) = find("error_description").or_else(|| find("error")) {
                return Err(err.replace('+', " "));
            }
            // e.g. a favicon request: keep waiting
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Opens an https link in the default browser.
#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    if !url.starts_with("https://") || url.contains(['"', '\'', '`', '\n', '\r', ' ']) {
        return Err("unsupported url".into());
    }
    #[cfg(windows)]
    let mut cmd = {
        let mut c = std::process::Command::new("rundll32");
        c.args(["url.dll,FileProtocolHandler", &url]).creation_flags(0x0800_0000);
        c
    };
    #[cfg(target_os = "macos")]
    let mut cmd = {
        let mut c = std::process::Command::new("open");
        c.arg(&url);
        c
    };
    cmd.spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}
