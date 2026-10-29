//! SCELE (scele.cs.ui.ac.id, Fasilkom UI's Moodle) through Moodle's mobile web service,
//! for students verified with SSO UI (see sso.rs). The token is minted once from the user's
//! password and kept in the app's config folder; it never reaches the webview. Calls go through Rust because the webview's fetch would be
//! blocked by CORS, and only read-only functions are let through.
use serde::Serialize;
use serde_json::{json, Map, Value};
use tauri::{AppHandle, Manager};

const BASE: &str = "https://scele.cs.ui.ac.id";
const SERVICE: &str = "moodle_mobile_app";

/// The web-service functions the island may call. All of them only read.
const ALLOWED: &[&str] = &[
    "core_webservice_get_site_info",
    "core_calendar_get_action_events_by_timesort",
    "core_course_get_enrolled_courses_by_timeline_classification",
    "core_enrol_get_users_courses",
    "core_course_get_contents",
    "core_course_get_updates_since",
    "message_popup_get_popup_notifications",
    "mod_forum_get_forums_by_courses",
    "mod_forum_get_forum_discussions",
    "mod_assign_get_assignments",
    "mod_assign_get_submission_status",
    "gradereport_user_get_grade_items",
    "core_group_get_course_user_groups",
    "core_user_get_course_user_profiles",
];

/// One HTTP agent for every request here, so a sync's many calls reuse their connections (and
/// TLS handshakes) instead of opening one each.
fn agent() -> &'static ureq::Agent {
    static AGENT: std::sync::OnceLock<ureq::Agent> = std::sync::OnceLock::new();
    AGENT.get_or_init(|| ureq::AgentBuilder::new().timeout_connect(std::time::Duration::from_secs(15)).build())
}

/// The agent for every request that carries the SCELE token or the password. It follows no
/// redirects, so neither can be carried along to another address than scele.cs.ui.ac.id.
fn private_agent() -> &'static ureq::Agent {
    static AGENT: std::sync::OnceLock<ureq::Agent> = std::sync::OnceLock::new();
    AGENT.get_or_init(|| ureq::AgentBuilder::new().timeout_connect(std::time::Duration::from_secs(15)).redirects(0).build())
}

/// Where the SCELE token is kept: the system's credential store (Windows Credential Manager, the
/// macOS Keychain), which other programs and a copied folder can't read, rather than a file.
const VAULT_SERVICE: &str = "com.dynamicisland.ui.scele";
const VAULT_USER: &str = "token";

fn vault() -> Option<keyring::Entry> {
    keyring::Entry::new(VAULT_SERVICE, VAULT_USER).ok()
}

/// The saved token. One still in scele.json from before it moved to the credential store is moved
/// there, and taken out of the file, the first time it's needed.
fn token(app: &AppHandle) -> Option<String> {
    if let Some(mut saved) = load(app) {
        if let Some(t) = saved.get("token").and_then(Value::as_str).map(str::to_string) {
            if vault().is_some_and(|v| v.set_password(&t).is_ok()) {
                if let Some(o) = saved.as_object_mut() {
                    o.remove("token");
                }
                if let Ok(p) = token_path(app) {
                    let _ = std::fs::write(p, saved.to_string());
                }
            }
            return Some(t);
        }
    }
    vault()?.get_password().ok().filter(|t| !t.is_empty())
}

/// Largest course file read for the class schedule (a syllabus is far smaller).
const FILE_LIMIT: u64 = 20 * 1024 * 1024;

/// Downloads a file from a SCELE course page (e.g. its syllabus) with the saved token, as base64.
/// Only SCELE's own file URLs are fetched.
#[tauri::command]
pub async fn scele_file(app: AppHandle, url: String) -> Result<String, String> {
    use base64::Engine;
    use std::io::Read;
    let path = url
        .strip_prefix(&format!("{BASE}/webservice/pluginfile.php/"))
        .or_else(|| url.strip_prefix(&format!("{BASE}/pluginfile.php/")))
        .ok_or_else(|| "not a SCELE file".to_string())?
        .to_string();
    tauri::async_runtime::spawn_blocking(move || {
        if !crate::sso::saved(&app).is_some_and(|s| s.fasilkom) {
            return Err("signed-out".to_string());
        }
        let token = token(&app).ok_or_else(|| "signed-out".to_string())?;
        // the web-service file endpoint takes the token instead of a browser session
        let (path, query) = path.split_once('?').unwrap_or((path.as_str(), ""));
        let mut req = private_agent().get(&format!("{BASE}/webservice/pluginfile.php/{path}")).timeout(std::time::Duration::from_secs(30));
        for (k, v) in query.split('&').filter_map(|kv| kv.split_once('=')) {
            if k != "token" {
                req = req.query(k, v);
            }
        }
        let resp = req.query("token", &token).call().map_err(|_| "SCELE file unavailable".to_string())?;
        // a redirect isn't followed (it could carry the token elsewhere): it's no file
        if resp.status() != 200 {
            return Err("SCELE file unavailable".to_string());
        }
        let mut bytes = Vec::new();
        resp.into_reader().take(FILE_LIMIT).read_to_end(&mut bytes).map_err(|e| e.to_string())?;
        Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// A document a course links to, read for its timeline.
#[derive(Serialize)]
pub struct WebDoc {
    /// the media type it came as
    mime: String,
    /// a file name to tell its kind by ("sheet.csv", or the Drive file's own name)
    name: String,
    /// its bytes, base64
    data: String,
}

/// The Google id in a docs/drive link: the part after `/d/`, or an `id=` query value.
fn google_id(url: &str) -> Option<String> {
    let id = url
        .split_once("/d/")
        .map(|(_, rest)| rest)
        .or_else(|| url.split_once("id=").map(|(_, rest)| rest))?
        .split(['/', '?', '&', '#'])
        .next()?;
    (id.len() >= 10 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')).then(|| id.to_string())
}

/// Reads a Google Sheet (as CSV), Doc or Slides (as text) or Drive file that a course links to as
/// its timeline. Only those addresses are fetched. One that isn't shared publicly answers with
/// Google's sign-in page, which is reported as "signin".
#[tauri::command]
pub async fn web_doc(url: String) -> Result<WebDoc, String> {
    use base64::Engine;
    use std::io::Read;
    let id = google_id(&url).ok_or_else(|| "unsupported link".to_string())?;
    let (export, name) = if url.starts_with("https://docs.google.com/spreadsheets/") {
        // the tab the link points at, else the first one
        let gid: String = url.split_once("gid=").map(|(_, g)| g.chars().take_while(char::is_ascii_digit).collect()).unwrap_or_default();
        let tab = if gid.is_empty() { String::new() } else { format!("&gid={gid}") };
        (format!("https://docs.google.com/spreadsheets/d/{id}/export?format=csv{tab}"), "sheet.csv".to_string())
    } else if url.starts_with("https://docs.google.com/document/") {
        (format!("https://docs.google.com/document/d/{id}/export?format=txt"), "doc.txt".to_string())
    } else if url.starts_with("https://docs.google.com/presentation/") {
        (format!("https://docs.google.com/presentation/d/{id}/export/txt"), "slides.txt".to_string())
    } else if url.starts_with("https://drive.google.com/") {
        (format!("https://drive.google.com/uc?export=download&id={id}"), String::new())
    } else {
        return Err("unsupported link".into());
    };
    tauri::async_runtime::spawn_blocking(move || {
        let resp = agent()
            .get(&export)
            .timeout(std::time::Duration::from_secs(30))
            .call()
            .map_err(|e| match e {
                ureq::Error::Status(401 | 403 | 404, _) => "signin".to_string(),
                _ => "link unavailable".to_string(),
            })?;
        let mime = resp.header("Content-Type").unwrap_or("").to_string();
        // an export that comes back as a web page is Google asking to sign in
        if mime.starts_with("text/html") {
            return Err("signin".into());
        }
        let name = if name.is_empty() {
            resp.header("Content-Disposition")
                .and_then(|d| d.split("filename=").nth(1))
                .map(|f| f.trim_matches(|c| c == '"' || c == ';' || c == ' ').to_string())
                .unwrap_or_default()
        } else {
            name
        };
        let mut bytes = Vec::new();
        resp.into_reader().take(FILE_LIMIT).read_to_end(&mut bytes).map_err(|e| e.to_string())?;
        Ok(WebDoc { mime, name, data: base64::engine::general_purpose::STANDARD.encode(bytes) })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Clone, Serialize)]
pub struct SceleAccount {
    userid: i64,
    fullname: String,
    username: String,
}

fn token_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("scele.json"))
}

fn load(app: &AppHandle) -> Option<Value> {
    let text = std::fs::read_to_string(token_path(app).ok()?).ok()?;
    serde_json::from_str(&text).ok()
}

fn account_of(v: &Value) -> Option<SceleAccount> {
    Some(SceleAccount {
        userid: v.get("userid")?.as_i64()?,
        fullname: v.get("fullname")?.as_str()?.to_string(),
        username: v.get("username")?.as_str()?.to_string(),
    })
}

/// Moodle wants nested parameters as form fields: `courseids[0]=5`, `options[0][name]=x`.
fn flatten(prefix: &str, v: &Value, out: &mut Vec<(String, String)>) {
    match v {
        Value::Object(m) => {
            for (k, x) in m {
                let key = if prefix.is_empty() { k.clone() } else { format!("{prefix}[{k}]") };
                flatten(&key, x, out);
            }
        }
        Value::Array(a) => {
            for (i, x) in a.iter().enumerate() {
                flatten(&format!("{prefix}[{i}]"), x, out);
            }
        }
        Value::Bool(b) => out.push((prefix.to_string(), if *b { "1" } else { "0" }.to_string())),
        Value::Number(n) => out.push((prefix.to_string(), n.to_string())),
        Value::String(s) => out.push((prefix.to_string(), s.clone())),
        Value::Null => {}
    }
}

fn post_form(url: &str, fields: &[(String, String)]) -> Result<Value, String> {
    let pairs: Vec<(&str, &str)> = fields.iter().map(|(k, v)| (k.as_str(), v.as_str())).collect();
    let resp = private_agent()
        .post(url)
        .timeout(std::time::Duration::from_secs(20))
        .send_form(&pairs)
        .map_err(|e| match e {
            ureq::Error::Status(code, _) => format!("SCELE answered {code}"),
            _ => "SCELE is unreachable".to_string(),
        })?;
    let text = resp.into_string().map_err(|_| "SCELE is unreachable".to_string())?;
    serde_json::from_str(&text).map_err(|_| "SCELE sent something unexpected".to_string())
}

fn ws(token: &str, function: &str, params: &Value) -> Result<Value, String> {
    let mut fields = vec![
        ("wstoken".to_string(), token.to_string()),
        ("wsfunction".to_string(), function.to_string()),
        ("moodlewsrestformat".to_string(), "json".to_string()),
    ];
    flatten("", params, &mut fields);
    let v = post_form(&format!("{BASE}/webservice/rest/server.php"), &fields)?;
    // errors come back as a 200 with an exception object
    if v.get("exception").is_some() {
        let code = v.get("errorcode").and_then(Value::as_str).unwrap_or("");
        if code == "invalidtoken" || code == "accessexception" {
            return Err("signed-out".into());
        }
        return Err(v.get("message").and_then(Value::as_str).unwrap_or("SCELE error").to_string());
    }
    Ok(v)
}

pub fn forget_token(app: &AppHandle) {
    if let Ok(p) = token_path(app) {
        let _ = std::fs::remove_file(p);
    }
    if let Some(v) = vault() {
        let _ = v.delete_credential();
    }
}

/// Connects the SSO-verified student's SCELE account; only the resulting token is saved.
/// SCELE only issues app tokens for a password (its mobile login type is "in app", with no
/// SSO option), so the password is asked for once, for the account SSO UI already verified.
/// When SSO UI sent no faculty, this is also what confirms Fasilkom: SCELE is Fasilkom's own
/// e-learning, so the same account having courses there is the proof.
#[tauri::command]
pub async fn scele_login(app: AppHandle, password: String) -> Result<SceleAccount, String> {
    use zeroize::Zeroize;
    tauri::async_runtime::spawn_blocking(move || {
        let mut password = password;
        let Some(mut student) = crate::sso::saved(&app).filter(|s| s.fasilkom || s.needs_scele) else {
            password.zeroize();
            return Err("Verify your student status first".to_string());
        };
        let mut fields = vec![
            ("username".to_string(), student.username.clone()),
            ("password".to_string(), std::mem::take(&mut password)),
            ("service".to_string(), SERVICE.to_string()),
        ];
        let sent = post_form(&format!("{BASE}/login/token.php"), &fields);
        // the password is only needed for this one request: wiped from memory straight after
        for (_, value) in fields.iter_mut() {
            value.zeroize();
        }
        let v = sent?;
        let Some(token) = v.get("token").and_then(Value::as_str) else {
            return Err(v.get("error").and_then(Value::as_str).unwrap_or("Sign-in failed").to_string());
        };
        let info = ws(token, "core_webservice_get_site_info", &json!({}))?;
        let userid = info.get("userid").and_then(Value::as_i64).unwrap_or(0);
        if !student.fasilkom {
            let courses = ws(token, "core_enrol_get_users_courses", &json!({ "userid": userid }))?;
            if courses.as_array().is_none_or(|c| c.is_empty()) {
                return Err("This SCELE account has no courses, so Fasilkom couldn't be confirmed".into());
            }
            student.fasilkom = true;
            student.needs_scele = false;
            student.detail = format!("{} · Fasilkom confirmed by SCELE", student.detail);
            crate::sso::save(&app, &student)?;
        }
        // the token goes to the credential store only; if that can't be written, nothing is kept
        // (it isn't put in a file instead)
        vault()
            .ok_or_else(|| "The system's credential store isn't available".to_string())?
            .set_password(token)
            .map_err(|_| "Couldn't keep the SCELE connection in the system's credential store".to_string())?;
        // the file holds only who is connected, nothing secret
        let saved = json!({
            "userid": userid,
            "fullname": info.get("fullname").and_then(Value::as_str).unwrap_or(""),
            "username": info.get("username").and_then(Value::as_str).unwrap_or(""),
        });
        std::fs::write(token_path(&app)?, saved.to_string()).map_err(|e| e.to_string())?;
        account_of(&saved).ok_or_else(|| "Sign-in failed".to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// The signed-in account, if there is a saved token.
#[tauri::command]
pub fn scele_account(app: AppHandle) -> Option<SceleAccount> {
    token(&app)?;
    load(&app).as_ref().and_then(account_of)
}

#[tauri::command]
pub fn scele_logout(app: AppHandle) {
    forget_token(&app);
}

/// Calls one of the allowed web-service functions with the saved token.
#[tauri::command]
pub async fn scele_call(app: AppHandle, function: String, params: Option<Map<String, Value>>) -> Result<Value, String> {
    if !ALLOWED.contains(&function.as_str()) {
        return Err("function not allowed".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        if !crate::sso::saved(&app).is_some_and(|s| s.fasilkom) {
            return Err("signed-out".to_string());
        }
        let token = token(&app).ok_or_else(|| "signed-out".to_string())?;
        let result = ws(&token, &function, &Value::Object(params.unwrap_or_default()));
        if matches!(&result, Err(e) if e == "signed-out") {
            // the token was revoked or expired: forget it so the island asks to sign in again
            forget_token(&app);
        }
        result
    })
    .await
    .map_err(|e| e.to_string())?
}
