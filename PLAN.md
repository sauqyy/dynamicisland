# Astra Isle for Windows — Plan

A floating "island" pinned to the top-centre of the laptop screen that sits as a small black pill
and expands with liquid, gooey animations to show live activity: media, volume, battery,
notifications, timers.

---

## 1. Tech stack (recommended)

| Layer | Choice | Why |
|---|---|---|
| App shell | **Tauri 2** (Rust) | ~5–10 MB installer, low RAM (uses WebView2 already on Win 11), transparent, frameless, always-on-top windows |
| UI | **React + TypeScript + Vite** | Fast iteration on animation-heavy UI |
| Animation | **Motion (Framer Motion)** springs + **SVG gooey filter**; optional **WebGL metaball shader** later | Springs give the elastic morph; goo filter gives the "liquid" merge/split |
| Windows APIs | Rust `windows` crate (WinRT) | Media sessions, battery, audio volume, notifications, fullscreen detection |
| Styling | Plain CSS / CSS modules | Animations are mostly transform/size driven, no need for a big framework |

**Alternatives considered**
- *Electron* — easiest, but ~150 MB and heavier RAM for an app that runs 24/7.
- *C# WinUI 3 / WPF* — best native API access, but liquid/goo effects are much harder than in the browser (no SVG filters; you'd write Composition/Win2D shaders).

---

## 2. The "liquid" animation design

1. **Spring-morphing pill** — the island's `width`, `height`, and `border-radius` are animated with
   a spring (stiffness ~400, damping ~30) so it overshoots slightly and settles, like Apple's.
2. **Gooey merge/split** — island and "satellite" bubbles (e.g. a timer bubble that splits off to
   the side) live inside a container with an SVG filter:
   `feGaussianBlur (stdDeviation ~10) → feColorMatrix (alpha 18 -7)`.
   When two blobs come close they melt together; when they separate they stretch and snap apart.
3. **Content choreography** — content fades/blurs out *before* the shape morphs, then fades in
   once the shape is ~70% open (avoids squished text). Content is rendered *outside* the goo
   filter so text stays sharp.
4. **Micro-interactions** — hover: small "breathing" swell (scale 1.04); click: squash-and-stretch;
   new event: a droplet "drips" out of the pill and expands.
5. **Stretch goal: WebGL metaballs** — a fragment shader rendering signed-distance blobs for
   smoother, GPU-cheap liquid with subtle highlights / "liquid glass" sheen.
   (True glass refraction of the desktop behind is not possible from a transparent window — we
   fake it with gradients + specular highlights.)
6. **Performance rules** — animate only transform/opacity where possible, cap the goo filter area,
   pause rendering when idle, target 60 fps (120 on high-refresh panels).

---

## 3. Island states

| State | Size (approx) | Content |
|---|---|---|
| **Idle / compact** | 120 × 32 | Black pill; optionally tiny clock or music waveform |
| **Peek (hover)** | 200 × 38 | Swell + minimal info (track title, battery %) |
| **Activity (split)** | pill + side bubble | e.g. music on left, timer bubble split off on right |
| **Expanded (click)** | 360 × 160 | Full card: album art, scrubber, play/pause/next, etc. |
| **Alert (transient)** | 300 × 56, auto-collapse after 2–3 s | Volume/brightness OSD, charger plugged in, notification |

---

## 4. Features (by priority)

Tags: **[v1]** first release · **[v2]** next · **[v3]** later / stretch

### 4.1 Music & media
- **[v1] Now Playing** — title, artist, album art from any app using Windows media controls
  (Spotify, YouTube in browser, Apple Music, VLC…) via `GlobalSystemMediaTransportControlsSessionManager`.
- **[v1] Controls** — play/pause, next, previous, seekable progress bar.
- **[v1] Live waveform** — animated bars in the compact pill while music plays (tinted by album-art colour).
- **[v1] Synced lyrics** — current line shown in the pill, karaoke-style highlight in expanded view,
  auto-scroll; fetched from **LRCLIB** (free, no API key, time-synced `.lrc`), cached locally;
  manual offset adjust (+/- 0.5 s) if out of sync.
- **[v2] Album-art colour theming** — island glow/accent picks the dominant colour of the cover.
- **[v2] Switch source** — pick which app's media to show when several are playing.
- **[v3] Lyrics-only "karaoke mode"** — enlarged lyrics card, translation toggle.
- **[v3] Like / add to playlist** (Spotify Web API, optional login).

### 4.2 Productivity
- **[v1] Timer** — quick presets (1/5/10/25 min) + custom; countdown bubble splits off the island;
  liquid "fill draining" animation; alarm alert when done.
- **[v1] Stopwatch** — with laps.
- **[v1] To-do list** — add tasks from the island (type and Enter), check off with a liquid "pop",
  drag to reorder, due-time reminders that drip out of the island; saved locally.
- **[v2] Pomodoro** — focus/break cycles, session counter, optional auto Do-Not-Disturb.
- **[v2] Calendar** — next event countdown ("Meeting in 10 min"), join-link button (Outlook / Google Calendar).
- **[v2] Quick notes** — scratchpad that remembers its text.
- **[v2] Clipboard history** — last ~10 copied items, click to re-copy.
- **[v3] File shelf** — drag files onto the island to hold them temporarily, drag them out later.
- **[v3] Quick launcher** — pinned apps/folders/URLs.

### 4.3 System status & alerts
- **[v1] Battery** — charger plugged/unplugged animation (liquid charging fill), low-battery warning, % in peek.
- **[v1] Volume OSD** — liquid slider pop-up when volume changes; mute indicator.
- **[v2] Brightness OSD.**
- **[v2] Mic / camera in use** — green/orange privacy dot, which app is using it.
- **[v2] Wi-Fi / Bluetooth** — connection changes, Bluetooth headphones connected + their battery.
- **[v2] Caps Lock / Num Lock** indicator.
- **[v3] System monitor** — CPU / RAM / network speed mini-graph.
- **[v3] Download / copy progress** — progress bar for file transfers (where detectable).

### 4.4 Notifications & communication
- **[v2] Notification mirroring** — Windows toasts appear in the island, sender icon + preview
  (`UserNotificationListener`, needs permission).
- **[v2] Do Not Disturb** toggle from the island.
- **[v3] Quick reply** for supported apps.
- **[v3] Incoming call / meeting** indicator (Teams/Zoom/Discord status).

### 4.5 Info widgets
- **[v1] Clock & date** in the idle pill.
- **[v2] Weather** — current temp + icon, hourly forecast in expanded view (Open-Meteo, free, no key).
- **[v3] World clocks.**
- **[v3] Stock / crypto ticker** (display only).

### 4.6 Fun & personalisation
- **[v2] Themes** — black (Apple style), liquid glass, accent colours, light/dark.
- **[v2] Size / position / animation-speed settings.**
- **[v2] Keyboard shortcut** to open the island (e.g. `Ctrl+Alt+Space`).
- **[v3] Idle "pet" / mood animations** — the liquid blob reacts to music beats or wobbles when you hover.
- **[v3] Custom widgets / plugin system.**

### 4.7 Interaction model
- Hover → peek · click → expand · scroll on pill → change volume or skip track ·
  swipe left/right (touchpad) → switch widget · right-click → quick menu · `Esc` → collapse.

---

## 5. Window behaviour (the tricky Windows parts)

- Frameless, transparent, always-on-top, hidden from taskbar & Alt-Tab.
- Positioned top-centre of the active monitor; handles DPI scaling and monitor changes.
- **Click-through when not hovered**: the window is bigger than the pill (room to expand), so
  the transparent area must pass clicks through. Approach: Rust polls cursor position (~30 Hz) and
  toggles `set_ignore_cursor_events` when the cursor enters/leaves the pill's hit area.
- Auto-hide when a fullscreen app/game is in the foreground.
- System-tray icon (settings, pause, quit); "Start with Windows" option.
- Single instance only.

---

## 6. Architecture

```
dynamic-island/
├─ src-tauri/                 Rust backend
│  ├─ src/main.rs             window setup, tray, single-instance
│  ├─ src/window.rs           positioning, click-through, fullscreen detection
│  ├─ src/media.rs            media session watcher + commands (play/pause/…)
│  ├─ src/battery.rs          power status events
│  ├─ src/audio.rs            volume change events (Core Audio)
│  └─ src/notifications.rs    (V2)
└─ src/                       React frontend
   ├─ App.tsx                 state machine → which island state is shown
   ├─ island/Island.tsx       the morphing shape (springs + goo container)
   ├─ island/GooFilter.tsx    SVG filter definition
   ├─ widgets/                MediaWidget, BatteryAlert, VolumeOSD, Clock…
   └─ store/                  event queue + priority (alert > activity > idle)
```

- Rust emits events (`media-changed`, `battery-changed`, `volume-changed`) → frontend.
- Frontend calls Rust commands (`media_toggle`, `media_next`, `set_hit_area`).
- A small **priority queue** decides what the island shows when several things happen at once.

---

## 7. Milestones

1. **Skeleton** — Tauri + React project; transparent always-on-top window at top-centre; tray icon.
2. **Liquid prototype** — island with idle/peek/expanded states, spring morph, goo filter,
   split-bubble demo driven by fake data. *(Tune the feel here before wiring real data.)*
3. **Click-through & positioning** — hit-area toggling, DPI/multi-monitor, fullscreen auto-hide.
4. **Now Playing + lyrics** — real media session data + controls + album art, LRCLIB synced lyrics.
5. **System alerts** — battery, volume OSD, alert queue/priority.
6. **Productivity v1** — timer, stopwatch, to-do list (local storage).
7. **Polish & packaging** — settings window, start-with-Windows, installer (MSI/NSIS via Tauri), auto-update optional.
8. **V2 features** — Pomodoro, calendar, weather, notifications, privacy dots, themes, etc.
9. **V3 features** — file shelf, system monitor, plugins, etc.

---

## 8. Risks / unknowns

- **Click-through on transparent WebView2 windows** — needs the cursor-polling workaround; test early (milestone 3).
- **Goo filter cost** — SVG blur filters can be heavy on big areas; keep the filtered region small or move to WebGL.
- **Notification access** — requires a packaged identity (MSIX) or user consent; may limit V2.
- **Volume OSD** — we can *show* our own OSD on volume change, but hiding Windows' built-in flyout isn't officially supported.
- **Lyrics coverage** — LRCLIB is free but won't have every song (especially niche/regional tracks);
  fall back to unsynced lyrics or "No lyrics found". Spotify's own lyrics aren't available through a public API.
- **Lyric sync** — position comes from the media session; some apps report it coarsely, so we interpolate between updates.
- **Laptop has no notch** — island floats over content at the top; must be unobtrusive (small idle size, optional auto-hide).

---

## 9. Prerequisites to install

- Node.js 20+ and a package manager (npm/pnpm)
- Rust (rustup, MSVC toolchain) + Visual Studio Build Tools ("Desktop development with C++")
- WebView2 runtime (already on Windows 11)

---

## 10. Open questions for you

1. OK with **Tauri + React**, or do you prefer C#/.NET or Electron?
2. Look: **solid black Apple-style** pill, or a **translucent "liquid glass"** style?
3. Which features matter most for v1 beyond media + battery + volume?
4. Should it always be visible, or auto-hide until something happens?
