//! Public data the webview can't fetch itself: BMKG's forecast refuses a request from another site's page, and the
//! Kemendagri region list (wilayah.id) sends no CORS headers. Only those two, only their read-only JSON, over HTTPS,
//! following no redirects: nothing else can be fetched through here.
use std::io::Read;
use std::time::Duration;

/// Each host, and the path everything fetched from it must start with.
const ALLOWED: &[(&str, &str)] = &[("api.bmkg.go.id", "/publik/prakiraan-cuaca"), ("wilayah.id", "/api/")];
const LIMIT: u64 = 2 * 1024 * 1024;

fn agent() -> &'static ureq::Agent {
    static AGENT: std::sync::OnceLock<ureq::Agent> = std::sync::OnceLock::new();
    AGENT.get_or_init(|| {
        ureq::AgentBuilder::new()
            .redirects(0)
            .timeout(Duration::from_secs(12))
            .user_agent(concat!("AstraIsle/", env!("CARGO_PKG_VERSION"), " (+https://github.com/sauqyy/dynamicisland)"))
            .build()
    })
}

/// The body of a GET to one of the allowed addresses.
#[tauri::command]
pub async fn public_json(url: String) -> Result<String, String> {
    let u = tauri::Url::parse(&url).map_err(|_| "unsupported url".to_string())?;
    let allowed = u.scheme() == "https"
        && u.port().is_none()
        && u.username().is_empty()
        && u.password().is_none()
        && ALLOWED.iter().any(|(host, path)| u.host_str() == Some(*host) && u.path().starts_with(path));
    if !allowed {
        return Err("unsupported url".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let resp = agent().get(u.as_str()).call().map_err(|e| match e {
            ureq::Error::Status(code, _) => format!("{code}"),
            _ => "unreachable".to_string(),
        })?;
        if resp.status() != 200 {
            return Err(resp.status().to_string());
        }
        let mut body = String::new();
        resp.into_reader().take(LIMIT).read_to_string(&mut body).map_err(|e| e.to_string())?;
        Ok(body)
    })
    .await
    .map_err(|e| e.to_string())?
}
