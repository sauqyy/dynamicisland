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
    "gradereport_user_get_grade_items",
    "core_group_get_course_user_groups",
];

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
    let resp = ureq::post(url)
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
}

/// Connects the SSO-verified student's SCELE account; only the resulting token is saved.
/// SCELE only issues app tokens for a password (its mobile login type is "in app", with no
/// SSO option), so the password is asked for once, for the account SSO UI already verified.
/// When SSO UI sent no faculty, this is also what confirms Fasilkom: SCELE is Fasilkom's own
/// e-learning, so the same account having courses there is the proof.
#[tauri::command]
pub async fn scele_login(app: AppHandle, password: String) -> Result<SceleAccount, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut student = crate::sso::saved(&app)
            .filter(|s| s.fasilkom || s.needs_scele)
            .ok_or_else(|| "Verify your student status first".to_string())?;
        let fields = vec![
            ("username".to_string(), student.username.clone()),
            ("password".to_string(), password),
            ("service".to_string(), SERVICE.to_string()),
        ];
        let v = post_form(&format!("{BASE}/login/token.php"), &fields)?;
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
        let saved = json!({
            "token": token,
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
        let saved = load(&app).ok_or_else(|| "signed-out".to_string())?;
        let token = saved.get("token").and_then(Value::as_str).ok_or_else(|| "signed-out".to_string())?;
        let result = ws(token, &function, &Value::Object(params.unwrap_or_default()));
        if matches!(&result, Err(e) if e == "signed-out") {
            // the token was revoked or expired: forget it so the island asks to sign in again
            forget_token(&app);
        }
        result
    })
    .await
    .map_err(|e| e.to_string())?
}
