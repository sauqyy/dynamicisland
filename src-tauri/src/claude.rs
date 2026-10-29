//! Claude through your own Claude account, with no API key: it runs Claude Code (the program that comes with the
//! Claude app, or one you installed) in the background, signed in the way you sign in to Claude Code. The sign-in
//! is the official one: `claude auth login` opens your browser once.
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::time::Duration;

use serde::Serialize;
use serde_json::Value;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

fn quiet(cmd: &mut Command) -> &mut Command {
    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000);
    cmd
}

/// "2.1.309" -> [2, 1, 309], so versions compare the way people expect
fn version_key(v: &str) -> Vec<u32> {
    v.split('.').map(|p| p.parse().unwrap_or(0)).collect()
}

/// The newest copy of Claude Code that comes with the Claude desktop app.
fn bundled() -> Option<PathBuf> {
    let exe = if cfg!(windows) { "claude.exe" } else { "claude" };
    let roots: Vec<PathBuf> = if cfg!(windows) {
        let local = std::env::var_os("LOCALAPPDATA").map(PathBuf::from)?;
        // <Claude-Data>/<install id>/claude-code/<version>/<build>/claude.exe
        std::fs::read_dir(local.join("Claude-Data")).ok()?.flatten().map(|e| e.path().join("claude-code")).collect()
    } else {
        let home = std::env::var_os("HOME").map(PathBuf::from)?;
        vec![home.join("Library/Application Support/Claude/claude-code")]
    };
    let mut best: Option<(Vec<u32>, PathBuf)> = None;
    for root in roots {
        for version in std::fs::read_dir(&root).into_iter().flatten().flatten() {
            let key = version_key(&version.file_name().to_string_lossy());
            let direct = version.path().join(exe);
            let candidates: Vec<PathBuf> = std::iter::once(direct)
                .chain(std::fs::read_dir(version.path()).into_iter().flatten().flatten().map(|b| b.path().join(exe)))
                .collect();
            for c in candidates.into_iter().filter(|c| c.is_file()) {
                if best.as_ref().is_none_or(|(k, _)| key > *k) {
                    best = Some((key.clone(), c));
                }
            }
        }
    }
    best.map(|(_, p)| p)
}

/// Claude Code: one on the PATH, in the usual install spots, or the one that comes with the Claude app.
fn find_cli() -> Option<PathBuf> {
    let finder = if cfg!(windows) { "where" } else { "which" };
    if let Ok(out) = quiet(Command::new(finder).arg("claude")).output() {
        if out.status.success() {
            let text = String::from_utf8_lossy(&out.stdout).to_string();
            let lines: Vec<&str> = text.lines().map(str::trim).filter(|l| !l.is_empty()).collect();
            if let Some(l) = lines.iter().find(|l| l.ends_with(".exe")).or(lines.first()) {
                return Some(PathBuf::from(l));
            }
        }
    }
    if let Some(home) = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(PathBuf::from) {
        for rel in [".local/bin/claude.exe", ".local/bin/claude", ".claude/local/claude"] {
            let p = home.join(rel);
            if p.is_file() {
                return Some(p);
            }
        }
    }
    for p in ["/opt/homebrew/bin/claude", "/usr/local/bin/claude"] {
        if Path::new(p).is_file() {
            return Some(PathBuf::from(p));
        }
    }
    bundled()
}

/// Runs Claude Code and waits for it, giving up (and stopping it) after `limit`.
fn run(args: &[&str], stdin: Option<&str>, limit: Duration) -> Result<(bool, String), String> {
    let cli = find_cli().ok_or_else(|| "Claude Code isn't installed. Install it from claude.com/claude-code, or use the built-in brain".to_string())?;
    // a quiet folder of its own, so no project's notes or settings are picked up
    let work = std::env::temp_dir().join("dynamic-island-claude");
    let _ = std::fs::create_dir_all(&work);
    let mut cmd = Command::new(cli);
    cmd.args(args)
        .current_dir(work)
        .env_remove("CLAUDECODE")
        .env_remove("CLAUDE_CODE_ENTRYPOINT")
        .stdin(if stdin.is_some() { Stdio::piped() } else { Stdio::null() })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    quiet(&mut cmd);
    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
    if let (Some(text), Some(mut pipe)) = (stdin, child.stdin.take()) {
        let _ = pipe.write_all(text.as_bytes());
    }
    let pid = child.id();
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let _ = tx.send(child.wait_with_output());
    });
    match rx.recv_timeout(limit) {
        Ok(Ok(out)) => Ok((out.status.success(), String::from_utf8_lossy(&out.stdout).to_string())),
        Ok(Err(e)) => Err(e.to_string()),
        Err(_) => {
            let _ = if cfg!(windows) {
                quiet(Command::new("taskkill").args(["/F", "/T", "/PID", &pid.to_string()])).output()
            } else {
                Command::new("kill").args(["-9", &pid.to_string()]).output()
            };
            Err("Claude took too long to answer".into())
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeStatus {
    /// Claude Code could be found on this computer
    found: bool,
    /// and it is signed in to a Claude account
    logged_in: bool,
}

#[tauri::command]
pub async fn claude_status() -> ClaudeStatus {
    tauri::async_runtime::spawn_blocking(|| {
        if find_cli().is_none() {
            return ClaudeStatus { found: false, logged_in: false };
        }
        let logged_in = run(&["auth", "status"], None, Duration::from_secs(20))
            .ok()
            .and_then(|(_, out)| serde_json::from_str::<Value>(&out).ok())
            .and_then(|v| v["loggedIn"].as_bool())
            .unwrap_or(false);
        ClaudeStatus { found: true, logged_in }
    })
    .await
    .unwrap_or(ClaudeStatus { found: false, logged_in: false })
}

/// Signs in. This opens the browser and waits (up to five minutes) for you to finish there.
#[tauri::command]
pub async fn claude_login() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(|| {
        let (ok, _) = run(&["auth", "login"], None, Duration::from_secs(300)).map_err(|e| if e.contains("too long") { "The sign-in wasn't finished in time".to_string() } else { e })?;
        if ok { Ok(()) } else { Err("The sign-in didn't finish. Try again".into()) }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn claude_logout() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(|| run(&["auth", "logout"], None, Duration::from_secs(30)).map(|_| ()))
        .await
        .map_err(|e| e.to_string())?
}

/// One answer from Claude. `model` is haiku, sonnet or opus; `messages` is the conversation ({role, content}).
#[tauri::command]
pub async fn claude_chat(model: String, system: String, messages: Vec<Value>) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let turn = |m: &Value| format!("{}: {}", if m["role"] == "assistant" { "Assistant" } else { "User" }, m["content"].as_str().unwrap_or(""));
        let prompt = match messages.split_last() {
            Some((last, earlier)) if !earlier.is_empty() => {
                format!("Earlier in this conversation:\n{}\n\nThe user now says: {}", earlier.iter().map(turn).collect::<Vec<_>>().join("\n"), last["content"].as_str().unwrap_or(""))
            }
            Some((last, _)) => last["content"].as_str().unwrap_or("").to_string(),
            None => return Err("Nothing to answer".into()),
        };
        let model = if ["haiku", "sonnet", "opus"].contains(&model.as_str()) { model } else { "haiku".into() };
        let args = ["-p", "--output-format", "json", "--system-prompt", &system, "--tools", "", "--model", &model, "--max-turns", "1", "--no-session-persistence"];
        let (_, out) = run(&args, Some(&prompt), Duration::from_secs(90))?;
        let v: Value = serde_json::from_str(out.trim()).map_err(|_| "Claude sent back something I couldn't read".to_string())?;
        let text = v["result"].as_str().unwrap_or("").trim().to_string();
        if v["is_error"].as_bool().unwrap_or(false) {
            return Err(if text.contains("Not logged in") || text.contains("/login") {
                "You're not signed in to Claude. Sign in in Settings > Buddy".into()
            } else if text.contains("limit") {
                "Your Claude usage limit was reached for now. Try again later, or use the built-in brain".into()
            } else {
                "Claude couldn't answer right now. Try again in a moment".into()
            });
        }
        if text.is_empty() { Err("Claude sent back an empty answer".into()) } else { Ok(text) }
    })
    .await
    .map_err(|e| e.to_string())?
}
