# Island Buddy — mascot + voice assistant plan

A small 2D mascot lives in the island. Press a hotkey, the island glows and the mascot wakes up and
listens. You talk, it answers in text and out loud, and it can do things on the laptop (open apps,
sites, files, control music, start timers). Its look, voice, personality and what it is allowed to do
are all set by the user.

Nothing here is built yet. This is the plan to agree on first.

---

## 1. What the user experiences

1. **Idle** — (optional) the mascot sits small at the left end of the pill, breathing and blinking
   now and then. It can be turned off so the pill looks exactly like today.
2. **Press the hotkey** (default `Ctrl+Shift+Space`, rebindable)
   - a short "wake" chime, the pill springs open to the *listening* shape (~320 × 64)
   - the outline glows in the accent colour; the glow pulses with your voice level
   - the mascot pops up, ears/antenna perk, and bobs to the mic level
   - your words appear live under the mascot as you speak
3. **Let go of the key** (hold-to-talk) **or press it again** (toggle mode, stops on silence too)
   - glow turns to a slow "thinking" shimmer, mascot looks up with three bouncing dots
4. **Answer**
   - the island grows into a short card: mascot on the left, the reply typed out on the right
   - the reply is spoken; the mascot's mouth moves with the voice
   - if it ran an action, a small chip shows it ("Opened Spotify ✓")
5. **After it finishes** the card stays a few seconds, then collapses. Pressing the hotkey again
   within ~30 s continues the same conversation (follow-ups like "and turn it up").
6. **Esc** or clicking away cancels at any point. Errors (no mic, no internet, no key) make the mascot
   look confused and say what's wrong in one line.

---

## 2. Architecture

```
 hotkey (Rust, global) ──event──▶ React: AssistantController (state machine)
                                      │
             mic (getUserMedia, chosen micId) ──▶ STT provider ──▶ transcript
                                      │
                       Rust: assistant_chat(history, transcript)
                         └─ LLM with tool definitions ──▶ tool calls
                              └─ Rust tool runner (allow-list) ──▶ results back to LLM
                                      │
                             reply text ──▶ TTS provider ──▶ speaker (chosen speakerId)
                                      │
              Mascot + glow animate from the state machine and live audio levels
```

### State machine (new `src/lib/useAssistant.ts`)

`off → idle → listening → thinking → (acting) → speaking → lingering → idle`, plus `error`.
It plugs into the existing `mode` chain in `App.tsx` as a new top-priority `'assistant'` mode
(below `updating`, above `expanded`), so it overrides whatever the island was showing and
hands back cleanly when done.

### Why the LLM call lives in Rust
API keys are kept in the OS credential store (Windows Credential Manager / macOS Keychain via the
`keyring` crate), never in `localStorage` or the webview. Rust already has `ureq` for HTTP, and the
tool runner has to be in Rust anyway to touch the system.

---

## 3. Pieces in detail

### 3.1 Global hotkey
- Add `tauri-plugin-global-shortcut`. It reports **Pressed** and **Released**, which gives us both
  hold-to-talk and toggle.
- Rust emits `assistant://key` `{ state: "down" | "up" }` to the webview.
- Settings: a "press the keys" recorder; warns if the combo is already taken (registration fails).

### 3.2 Listening (speech → text)
WebView2's built-in `SpeechRecognition` is not dependable inside a Tauri app, so we record audio
ourselves and send it to a provider behind a small interface:

| Provider | Cost | Privacy | Notes |
|---|---|---|---|
| **Whisper-compatible API** (OpenAI, Groq, …) | cheap / per minute | cloud | best accuracy, many languages — **recommended default** |
| **Local Whisper** (`whisper-rs`, tiny/base model) | free | fully offline | ~75–150 MB model download, a bit slower; phase 4 |
| **Windows speech** (`Windows.Media.SpeechRecognition`) | free | offline | lower quality, Windows only; fallback |

- Record with `getUserMedia` using the mic already chosen in `audioDevices.ts`.
- An `AnalyserNode` gives the live level for the glow and mascot bob.
- Silence detection (~1.2 s quiet) ends toggle-mode recording automatically.
- The existing privacy watcher (`system.rs::spawn_privacy`) will see our own mic use; filter out our
  own process so it doesn't raise a "mic in use" alert about itself.

### 3.3 Thinking (the brain)
- Default model: **Claude Haiku 5.5** (fast enough to feel snappy), with a switch to Sonnet/Opus for
  smarter answers. Provider is pluggable so an OpenAI-compatible or local (Ollama) endpoint can be
  added later.
- System prompt is built from the personalisation settings (name, personality, language, answer
  length) plus small live context: time, what's playing, open timers, today's deadlines — all of
  which the app already knows.
- Replies are short by default (1–3 sentences), because they're spoken.
- Conversation history kept in memory only, cleared after the follow-up window.
- **Fast path**: plain commands like "open spotify" / "pause" / "next song" are matched locally first,
  so they run instantly without an API call (and work offline).

### 3.4 Doing things on the laptop (tools)
A fixed set of tools the model can call. **No raw shell access.** Each tool can be switched on/off in
Settings, and risky ones ask for confirmation in the island first ("Shut down? Yes / No").

| Tool | What it does | Reuses |
|---|---|---|
| `open_app(name)` | launch an installed app | new app index (Start Menu `.lnk` scan / `/Applications`) |
| `open_url(url)` / `web_search(q)` | open in default browser | `auth::open_url` |
| `open_path(path)` | open a file or folder | `files::open_path` |
| `media(action)` | play/pause/next/prev/seek | `media.rs` commands |
| `set_volume(pct)` / `mute` | system volume | `system.rs` audio endpoint code |
| `start_timer(min)` / `pomodoro` | island timers | existing timer state |
| `add_todo(text)` / `add_deadline(...)` | island lists | `TodoWidget`, `lib/deadlines.ts` |
| `run_routine(name)` | user-defined combo (see below) | — |
| `lock_screen`, `sleep`, `shutdown` | system power | off by default, always confirm |

**Personal routines / aliases** (Settings → Assistant → Routines): the user defines a phrase and a list
of steps, e.g. *"study mode" → open Notion, open lo-fi playlist URL, start 25-min pomodoro.* These are
exposed to the model as `run_routine` and also matched by the fast path.

**App aliases**: map nicknames to apps/paths ("my notes" → `D:\Notes`, "the game" → Steam game).

### 3.5 Speaking (text → speech)
| Provider | Cost | Notes |
|---|---|---|
| **System voices** (`speechSynthesis`) | free, offline | **default**; voice, rate, pitch selectable |
| **Cloud voices** (OpenAI TTS / ElevenLabs) | paid | much more natural, "cute" voices; phase 3 |

- Cloud audio plays through an `<audio>` element with `setSinkId(speakerId)` so it respects the
  chosen speaker; an analyser on it drives the mouth.
- System voices can't pick a device or be analysed, so the mouth is driven by word-boundary
  events instead.
- Option: text only (muted), or voice only when the island isn't focused.

### 3.6 The mascot (2D)
- **Built as layered SVG in React + Motion**, not a GIF/video: tiny, crisp at any scale, recoloured
  by the accent/theme, and each part (body, eyes, mouth, ears, cheeks) animates independently.
- **One default character** to start: a round little blob with big eyes and a tiny antenna whose
  tip is the glow colour — reads well at 24 px in the pill and 64 px in the card.
- **Expressions/states**: idle (breathe + random blink), wake (pop + squash), listening (lean in,
  bob to mic level), thinking (eyes up, dots), talking (mouth shapes from audio level), happy (after
  an action succeeds), confused (error), sleepy (late night / long idle — just for fun).
- **Personalisation**: body colour (or follow accent), accessory (none / bow / headphones / hat),
  2–3 alternate characters later (cat, ghost, robot). Name shown in the card.
- Respects the island's existing `anim` setting (bouncy/smooth/snappy) for its springs.
- Stage is 520 px wide (`App.css` / `Island.tsx`), so all assistant shapes stay within it.

### 3.7 The glow
- Reuse the ringing-glow path that `Island.tsx` already has for incoming calls, extended to an
  `assistant` variant: animated conic gradient around the notch outline, colour = accent.
- Intensity follows mic level while listening, slow shimmer while thinking, soft steady pulse while
  speaking, quick red flash on error.

---

## 4. Settings → new "Assistant" section

- **On/off**, hotkey + hold-to-talk vs toggle, show mascot in idle pill
- **Mascot**: character, colour, accessory, name
- **Personality**: preset (cheerful / calm / sassy / professional) + free-text "how it should act",
  answer length, language
- **Voice**: provider, voice, rate, pitch, mute
- **Brain**: provider, model, API key (stored in OS keychain), "test" button
- **Listening**: STT provider, language, silence timeout
- **Actions**: toggle per tool, confirm-before-run toggles, app aliases, routines editor
- **Privacy**: clear conversation now, "never send live context" switch

Stored with the rest of the settings in `lib/settings.ts` (keys excluded).

---

## 5. Files

**New**
- `src-tauri/src/assistant.rs` — LLM request loop, tool runner, keychain access
- `src-tauri/src/apps.rs` (+ `apps_mac.rs`) — installed app index for `open_app`
- `src/lib/useAssistant.ts` — state machine, hotkey events, conversation
- `src/lib/stt.ts`, `src/lib/tts.ts` — provider interfaces + implementations
- `src/lib/micLevel.ts` — recording + analyser + silence detection
- `src/lib/intents.ts` — fast-path local command matcher
- `src/mascot/Mascot.tsx`, `src/mascot/parts/*` — the character and expressions
- `src/widgets/AssistantCard.tsx` — listening / thinking / answer UI inside the island
- `sounds/` — wake + done chimes (fits the existing sound packs)

**Changed**
- `src-tauri/Cargo.toml` — `tauri-plugin-global-shortcut`, `keyring`
- `src-tauri/src/lib.rs` — register plugin + commands
- `src-tauri/capabilities/default.json` — global-shortcut permissions
- `src/App.tsx` — `'assistant'` mode, shapes, mount mascot
- `src/island/Island.tsx` — assistant glow variant
- `src/lib/settings.ts`, `src/widgets/SettingsWidget.tsx` — Assistant settings
- `src-tauri/src/system.rs` — ignore our own mic use in the privacy watcher

---

## 6. Build order

1. **Mascot + glow + hotkey, no AI** — character with all expressions, glow variant, hotkey wakes
   it, mic level drives listening animation. A "demo" button cycles states. *Feels alive already.*
2. **Talk loop** — STT (cloud Whisper), Claude reply, system-voice TTS, text in the card, follow-ups.
3. **Actions** — tool runner, app index, fast path, confirmations, routines & aliases, settings UI.
4. **Polish & options** — cloud voices with lip sync, local Whisper (offline), extra characters and
   accessories, mascot in idle pill, macOS parity.

Each phase ships on its own and is testable.

---

## 7. Decisions to make before building

1. **AI provider & cost** — OK to use your own Claude API key (stored in the keychain)? Or route
   through your Supabase project (an edge function holding the key) so friends using the app don't
   need their own key — that costs you per use.
2. **Speech-to-text** — cloud Whisper by default (needs a key, best quality) or offline-first?
3. **Hold-to-talk or toggle** as the default?
4. **Mascot look** — the default round blob, or do you have a character/art in mind?
5. **Action safety** — fine with power actions (lock/sleep/shutdown) existing but off by default?
