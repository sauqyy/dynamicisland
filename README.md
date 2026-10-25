# Dynamic Island

See [PLAN.md](PLAN.md) for the full plan.

## Status
- [x] Frontend prototype (React + Vite + motion): liquid pill, goo-split timer bubble,
      media card with synced lyrics (LRCLIB), timer, to-do list, battery/volume alerts.
      Runs in the browser with fake data and a demo panel.
- [x] Tauri shell: transparent always-on-top window, tray (Quit), click-through, hover from Rust
- [x] Real Windows data: media session (Spotify etc.) + cover art + controls, battery, volume
- [x] Synced lyrics from LRCLIB for the real playing song
- [x] Timer, stopwatch (laps), to-do list
- [ ] Hide on fullscreen apps, multi-monitor/DPI testing, settings, start with Windows

## Develop
```
npm install
npm run dev          # browser demo at http://localhost:5173 (fake data)
npm run tauri dev    # the real app (needs Rust + MSVC Build Tools)
```
