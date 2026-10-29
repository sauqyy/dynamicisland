//! The assistant's built-in brain: llama.cpp (a small, fast program for running language models) and a Qwen model,
//! both downloaded the first time they are needed and kept in the app's data folder. The program runs in the
//! background as a local server that only this app can talk to.
//!
//! This file has no dependency on the app itself, so it can be tried on its own (see examples/llm_smoke.rs).
use std::fs;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde_json::{json, Value};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// The llama.cpp build that is downloaded. One fixed build, so every install behaves the same way.
const ENGINE_TAG: &str = "b11981";
const RELEASE: &str = "https://github.com/ggml-org/llama.cpp/releases/download";

/// A model that can be chosen in Settings.
#[derive(Clone, Debug)]
pub struct ModelSpec {
    pub key: &'static str,
    pub file: &'static str,
    pub url: &'static str,
    /// the download size, for a sanity check
    pub bytes: u64,
}

pub const MODEL_3B: ModelSpec = ModelSpec {
    key: "qwen2.5-3b",
    file: "qwen2.5-3b-instruct-q4_k_m.gguf",
    url: "https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf",
    bytes: 2_104_932_768,
};
pub const MODEL_1_5B: ModelSpec = ModelSpec {
    key: "qwen2.5-1.5b",
    file: "qwen2.5-1.5b-instruct-q4_k_m.gguf",
    url: "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf",
    bytes: 1_117_320_736,
};

/// "auto" picks by how much memory the PC has: the 3B model needs about 3 GB free.
pub fn pick_model(choice: &str, ram_gb: u64) -> ModelSpec {
    match choice {
        "qwen2.5-3b" => MODEL_3B,
        "qwen2.5-1.5b" => MODEL_1_5B,
        _ if ram_gb >= 8 => MODEL_3B,
        _ => MODEL_1_5B,
    }
}

/// Installed memory in whole gigabytes (0 if it cannot be read).
pub fn ram_gb() -> u64 {
    #[cfg(windows)]
    {
        use windows::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};
        let mut m = MEMORYSTATUSEX { dwLength: std::mem::size_of::<MEMORYSTATUSEX>() as u32, ..Default::default() };
        if unsafe { GlobalMemoryStatusEx(&mut m) }.is_ok() {
            return m.ullTotalPhys / (1 << 30);
        }
        0
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("sysctl")
            .args(["-n", "hw.memsize"])
            .output()
            .ok()
            .and_then(|o| String::from_utf8_lossy(&o.stdout).trim().parse::<u64>().ok())
            .map(|b| b / (1 << 30))
            .unwrap_or(0)
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        0
    }
}

/// Which program build fits this computer, and what the archive is called.
fn engine_archive() -> Result<String, String> {
    let name = if cfg!(all(windows, target_arch = "x86_64")) {
        // Vulkan runs on NVIDIA, AMD and Intel graphics, and falls back to the processor without one
        format!("llama-{ENGINE_TAG}-bin-win-vulkan-x64.zip")
    } else if cfg!(all(windows, target_arch = "aarch64")) {
        format!("llama-{ENGINE_TAG}-bin-win-cpu-arm64.zip")
    } else if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        format!("llama-{ENGINE_TAG}-bin-macos-arm64.tar.gz")
    } else if cfg!(target_os = "macos") {
        format!("llama-{ENGINE_TAG}-bin-macos-x64.tar.gz")
    } else {
        return Err("The built-in brain isn't available on this system yet".into());
    };
    Ok(name)
}

fn server_name() -> &'static str {
    if cfg!(windows) { "llama-server.exe" } else { "llama-server" }
}

/// Finds llama-server anywhere inside the unpacked engine folder.
fn find_server(dir: &Path) -> Option<PathBuf> {
    for e in fs::read_dir(dir).ok()?.flatten() {
        let p = e.path();
        if p.is_dir() {
            if let Some(f) = find_server(&p) {
                return Some(f);
            }
        } else if p.file_name().is_some_and(|n| n == server_name()) {
            return Some(p);
        }
    }
    None
}

fn engine_dir(root: &Path) -> PathBuf {
    root.join("engine").join(ENGINE_TAG)
}

/// The engine, if it is already downloaded.
pub fn installed_engine(root: &Path) -> Option<PathBuf> {
    find_server(&engine_dir(root))
}

pub fn model_path(root: &Path, spec: &ModelSpec) -> PathBuf {
    root.join("models").join(spec.file)
}

pub fn model_installed(root: &Path, spec: &ModelSpec) -> bool {
    fs::metadata(model_path(root, spec)).map(|m| m.len() >= spec.bytes).unwrap_or(false)
}

/// Downloads a file, continuing from where an interrupted download stopped. `report` gets 0.0 to 1.0.
pub fn download(url: &str, dest: &Path, report: &dyn Fn(f32)) -> Result<(), String> {
    if let Some(dir) = dest.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let part = dest.with_extension("part");
    let have = fs::metadata(&part).map(|m| m.len()).unwrap_or(0);
    // no overall time limit (a model takes as long as it takes), only a limit on silence
    let agent = ureq::AgentBuilder::new().timeout_connect(Duration::from_secs(20)).timeout_read(Duration::from_secs(60)).build();
    let mut req = agent.get(url).set("user-agent", "dynamic-island");
    if have > 0 {
        req = req.set("range", &format!("bytes={have}-"));
    }
    let resp = match req.call() {
        Ok(r) => r,
        // the whole file is already here (a finished download that was never renamed)
        Err(ureq::Error::Status(416, _)) => {
            return fs::rename(&part, dest).map_err(|e| e.to_string());
        }
        Err(_) => return Err("Couldn't download it. Check your internet connection".into()),
    };
    let resumed = resp.status() == 206;
    let remaining: u64 = resp.header("content-length").and_then(|v| v.parse().ok()).unwrap_or(0);
    let start = if resumed { have } else { 0 };
    let total = start + remaining;
    let mut file = if resumed { fs::OpenOptions::new().append(true).open(&part) } else { fs::File::create(&part) }.map_err(|e| e.to_string())?;
    let mut reader = resp.into_reader();
    let mut buf = vec![0u8; 256 * 1024];
    let mut done = start;
    let mut last = Instant::now() - Duration::from_secs(1);
    loop {
        let n = reader.read(&mut buf).map_err(|_| "The download was interrupted. Try again to continue it".to_string())?;
        if n == 0 {
            break;
        }
        file.write_all(&buf[..n]).map_err(|e| e.to_string())?;
        done += n as u64;
        if total > 0 && last.elapsed() > Duration::from_millis(250) {
            report((done as f32 / total as f32).min(1.0));
            last = Instant::now();
        }
    }
    file.flush().map_err(|e| e.to_string())?;
    drop(file);
    if total > 0 && done < total {
        return Err("The download stopped early. Try again to continue it".into());
    }
    fs::rename(&part, dest).map_err(|e| e.to_string())?;
    report(1.0);
    Ok(())
}

/// Makes sure the llama.cpp program is downloaded and unpacked.
pub fn ensure_engine(root: &Path, report: &dyn Fn(f32)) -> Result<PathBuf, String> {
    if let Some(p) = installed_engine(root) {
        return Ok(p);
    }
    let archive_name = engine_archive()?;
    let archive = root.join("engine").join(&archive_name);
    download(&format!("{RELEASE}/{ENGINE_TAG}/{archive_name}"), &archive, report)?;
    let dest = engine_dir(root);
    let _ = fs::remove_dir_all(&dest);
    fs::create_dir_all(&dest).map_err(|e| e.to_string())?;
    // the system's own tar understands both .zip and .tar.gz; the full path avoids another tar earlier on the PATH
    let tar = if cfg!(windows) {
        PathBuf::from(std::env::var_os("SystemRoot").unwrap_or_else(|| "C:\\Windows".into())).join("System32").join("tar.exe")
    } else {
        PathBuf::from("tar")
    };
    let mut cmd = Command::new(tar);
    cmd.arg("-xf").arg(&archive).arg("-C").arg(&dest);
    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000);
    let ok = cmd.status().map(|s| s.success()).unwrap_or(false);
    let _ = fs::remove_file(&archive);
    if !ok {
        let _ = fs::remove_dir_all(&dest);
        return Err("Couldn't unpack the brain's engine".into());
    }
    find_server(&dest).ok_or_else(|| "The brain's engine was missing from its download".to_string())
}

/// Makes sure the model file is downloaded.
pub fn ensure_model(root: &Path, spec: &ModelSpec, report: &dyn Fn(f32)) -> Result<PathBuf, String> {
    let path = model_path(root, spec);
    if model_installed(root, spec) {
        return Ok(path);
    }
    download(spec.url, &path, report)?;
    if !model_installed(root, spec) {
        let _ = fs::remove_file(&path);
        return Err("The downloaded model was incomplete. Try again".into());
    }
    Ok(path)
}

/// The running llama-server.
pub struct Server {
    child: Child,
    port: u16,
    key: String,
    pub model_key: String,
    /// "gpu" when layers were put on the graphics card
    pub device: String,
}

impl Server {
    pub fn stop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
    pub fn alive(&mut self) -> bool {
        matches!(self.child.try_wait(), Ok(None))
    }
}

/// On Windows the server is tied to this app: if the app closes or crashes, Windows stops the server too.
#[cfg(windows)]
fn tie_to_this_app(child: &Child) {
    use std::os::windows::io::AsRawHandle;
    use windows::Win32::Foundation::HANDLE;
    use windows::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation, SetInformationJobObject,
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };
    use std::sync::OnceLock;
    struct Job(HANDLE);
    unsafe impl Send for Job {}
    unsafe impl Sync for Job {}
    static JOB: OnceLock<Option<Job>> = OnceLock::new();
    let job = JOB.get_or_init(|| unsafe {
        let h = CreateJobObjectW(None, None).ok()?;
        let mut info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        SetInformationJobObject(h, JobObjectExtendedLimitInformation, &info as *const _ as *const _, std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32).ok()?;
        Some(Job(h))
    });
    if let Some(Job(h)) = job {
        unsafe {
            let _ = AssignProcessToJobObject(*h, HANDLE(child.as_raw_handle()));
        }
    }
}
#[cfg(not(windows))]
fn tie_to_this_app(_child: &Child) {}

fn free_port() -> Result<u16, String> {
    TcpListener::bind("127.0.0.1:0").and_then(|l| l.local_addr()).map(|a| a.port()).map_err(|e| e.to_string())
}

/// A password for the server, so only this app can use it.
fn random_key() -> String {
    let t = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    format!("{:x}{:x}", t, std::process::id())
}

/// Which graphics card to use, if any. By default llama.cpp spreads a model over every graphics chip it sees, and
/// a laptop's weak built-in chip then slows the strong one down a lot (about 9 words a second instead of 70). So the
/// best separate card is picked on its own, and without one (or without room for the model) the processor is used.
/// Returns the arguments to pass, and whether a graphics card is used.
fn pick_device(exe: &Path, model_bytes: u64) -> (Vec<String>, bool) {
    let cpu = (vec!["--device".to_string(), "none".to_string(), "-ngl".to_string(), "0".to_string()], false);
    let mut cmd = Command::new(exe);
    cmd.arg("--list-devices").current_dir(exe.parent().unwrap_or(Path::new("."))).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000);
    let Ok(out) = cmd.output() else { return cpu };
    let text = format!("{}\n{}", String::from_utf8_lossy(&out.stdout), String::from_utf8_lossy(&out.stderr));
    let need_mib = model_bytes / (1 << 20) * 5 / 4;
    let mut best: Option<(String, u64)> = None;
    for line in text.lines().map(str::trim).filter(|l| l.starts_with("Vulkan") || l.starts_with("Metal")) {
        let Some((id, rest)) = line.split_once(':') else { continue };
        let lower = rest.to_lowercase();
        // Apple's graphics share the memory with the processor and are the fast way on a Mac
        let separate = cfg!(target_os = "macos") || ["nvidia", "geforce", "rtx", "radeon", "amd", "arc"].iter().any(|k| lower.contains(k));
        if !separate {
            continue;
        }
        // "(7957 MiB, 7189 MiB free)": the second number is what is left to use
        let free = rest.rfind('(').map(|i| &rest[i + 1..]).and_then(|t| t.split(',').nth(1)).and_then(|t| t.trim().split(' ').next().and_then(|n| n.parse::<u64>().ok())).unwrap_or(0);
        if free >= need_mib && best.as_ref().is_none_or(|(_, f)| free > *f) {
            best = Some((id.trim().to_string(), free));
        }
    }
    match best {
        Some((id, _)) => (vec!["--device".to_string(), id, "-ngl".to_string(), "99".to_string()], true),
        None => cpu,
    }
}

/// Starts llama-server on the model and waits until it is ready to answer.
pub fn start_server(exe: &Path, model: &Path, model_key: &str, model_bytes: u64, report: &dyn Fn(f32)) -> Result<Server, String> {
    let (device_args, on_gpu) = pick_device(exe, model_bytes);
    let port = free_port()?;
    let key = random_key();
    let mut cmd = Command::new(exe);
    cmd.current_dir(exe.parent().unwrap_or(Path::new(".")))
        .args(["-m"])
        .arg(model)
        .args(["--host", "127.0.0.1", "--port", &port.to_string(), "--api-key", &key])
        // a small memory: one conversation at a time, a context long enough for a chat
        .args(["-c", "4096", "-np", "1", "--no-webui"])
        .args(&device_args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000);
    let mut child = cmd.spawn().map_err(|e| format!("Couldn't start the brain: {e}"))?;
    tie_to_this_app(&child);

    // what the server says while it starts, kept so a failure can be explained and the graphics card detected
    let log: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
    for pipe in [child.stdout.take().map(|p| Box::new(p) as Box<dyn Read + Send>), child.stderr.take().map(|p| Box::new(p) as Box<dyn Read + Send>)].into_iter().flatten() {
        let log = log.clone();
        std::thread::spawn(move || {
            use std::io::BufRead;
            for line in std::io::BufReader::new(pipe).lines().map_while(Result::ok) {
                let mut l = log.lock().unwrap();
                if l.len() < 2000 {
                    l.push(line);
                }
            }
        });
    }

    let started = Instant::now();
    let url = format!("http://127.0.0.1:{port}/health");
    loop {
        if let Ok(Some(_)) = child.try_wait() {
            let tail: Vec<String> = log.lock().unwrap().iter().rev().take(4).cloned().collect();
            return Err(format!("The brain stopped while starting: {}", tail.into_iter().rev().collect::<Vec<_>>().join(" | ")));
        }
        if let Ok(r) = ureq::get(&url).timeout(Duration::from_secs(2)).call() {
            if r.status() == 200 {
                break;
            }
        }
        if started.elapsed() > Duration::from_secs(240) {
            let _ = child.kill();
            return Err("The brain took too long to start".into());
        }
        // there is no real measure of loading progress, so it creeps towards the end
        report((started.elapsed().as_secs_f32() / 30.0).min(0.95));
        std::thread::sleep(Duration::from_millis(400));
    }
    Ok(Server { child, port, key, model_key: model_key.to_string(), device: if on_gpu { "gpu".into() } else { "cpu".into() } })
}

/// One answer. `messages` is the whole conversation, system prompt first.
pub fn chat(server: &Server, messages: &[Value], max_tokens: u32) -> Result<String, String> {
    let body = json!({ "messages": messages, "max_tokens": max_tokens, "temperature": 0.4, "top_p": 0.8, "top_k": 20, "repeat_penalty": 1.05, "stream": false, "cache_prompt": true });
    let resp = ureq::post(&format!("http://127.0.0.1:{}/v1/chat/completions", server.port))
        .timeout(Duration::from_secs(120))
        .set("authorization", &format!("Bearer {}", server.key))
        .set("content-type", "application/json")
        .send_string(&body.to_string())
        .map_err(|e| match e {
            ureq::Error::Status(code, _) => format!("The brain returned an error ({code})"),
            _ => "The brain isn't answering".to_string(),
        })?;
    let v: Value = serde_json::from_str(&resp.into_string().map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    let text = v["choices"][0]["message"]["content"].as_str().unwrap_or("").trim().to_string();
    if text.is_empty() { Err("The brain sent back an empty answer".into()) } else { Ok(text) }
}
