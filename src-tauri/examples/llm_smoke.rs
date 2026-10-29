//! Tries the built-in brain on its own, without the app: downloads the engine and model (once, into the same
//! folder the app uses), starts the server and asks it a few things.
//!
//!   cargo run --example llm_smoke -- auto
#[path = "../src/llm_core.rs"]
mod llm_core;

use std::path::PathBuf;
use std::time::Instant;

use serde_json::json;

fn main() {
    let choice = std::env::args().nth(1).unwrap_or_else(|| "auto".into());
    let root: PathBuf = PathBuf::from(std::env::var_os("LOCALAPPDATA").expect("LOCALAPPDATA")).join("com.dynamicisland.app").join("llm");
    let ram = llm_core::ram_gb();
    let spec = llm_core::pick_model(&choice, ram);
    println!("memory: {ram} GB, choice '{choice}' -> {}", spec.key);

    let show = |what: &'static str| {
        let last = std::cell::Cell::new(-1i32);
        move |p: f32| {
            let pct = (p * 100.0) as i32;
            if pct != last.get() && pct % 5 == 0 {
                last.set(pct);
                println!("  {what}: {pct}%");
            }
        }
    };

    let t = Instant::now();
    let exe = llm_core::ensure_engine(&root, &show("engine")).expect("engine");
    println!("engine ready: {} ({:.1}s)", exe.display(), t.elapsed().as_secs_f32());
    let t = Instant::now();
    let model = llm_core::ensure_model(&root, &spec, &show("model")).expect("model");
    println!("model ready: {} ({:.1}s)", model.display(), t.elapsed().as_secs_f32());

    let t = Instant::now();
    let mut server = llm_core::start_server(&exe, &model, spec.key, spec.bytes, &|_| {}).expect("server");
    println!("server started in {:.1}s, running on the {}", t.elapsed().as_secs_f32(), server.device);
    // `HOLD=1` keeps it running, so that what happens to the server when this program is killed can be checked
    if std::env::var_os("HOLD").is_some() {
        std::thread::sleep(std::time::Duration::from_secs(120));
    }

    let system = "You are Astra, a tiny voice assistant. Answer in one to three short spoken sentences, plain text. When the user asks you to do something, write one line per action starting with DO: and a short command (open <app>; volume up; set a <n> minute timer; add <text> to my to-do list), then one short sentence.";
    for q in ["What is the capital of Japan?", "Open Spotify and turn the volume up.", "Add buy milk to my to-do list.", "Tell me something nice."] {
        let t = Instant::now();
        let msgs = vec![json!({"role": "system", "content": system}), json!({"role": "user", "content": q})];
        match llm_core::chat(&server, &msgs, 160) {
            Ok(a) => println!("\n[{:.2}s] {q}\n{a}", t.elapsed().as_secs_f32()),
            Err(e) => println!("\n{q} -> ERROR {e}"),
        }
    }
    server.stop();
    println!("\nserver stopped");
}
