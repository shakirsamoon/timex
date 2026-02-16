<div align="center">

# ⏱ Timex

**A minimal countdown timer that floats on your screen.**

Built with Electron • Zero dependencies • Portable .exe

![Windows](https://img.shields.io/badge/platform-Windows-blue?logo=windows)
![Electron](https://img.shields.io/badge/electron-28-47848F?logo=electron)
![License](https://img.shields.io/badge/license-MIT-green)

![Timex Screenshot](https://raw.githubusercontent.com/shakirsamoon/timex/refs/heads/master/screenshot/screenshot.png)

</div>

---

## ✨ Features

| Feature | Description |
|---|---|
| 🔢 **Taskbar Countdown** | Live digits on the system tray icon (16×16 pixel font) |
| 🖥️ **Floating Widget** | Always-on-top translucent widget with large countdown |
| 📊 **Progress Bar** | Taskbar progress bar shows remaining time |
| 🔊 **Alarm Sounds** | 6 built-in sounds + custom audio file support |
| 🎛️ **Resize Widget** | Drag handle, scroll wheel, or preset sizes (Tiny → Huge) |
| 🎨 **Color States** | Green (running), Yellow (paused), Red (finished) |
| 🔔 **Notifications** | Windows notification when timer ends |



## 🚀 Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [bun](https://bun.com/)

### Install & Run

```bash
git clone https://github.com/shakirsamoon/timex.git
cd timex
bun i
bun start
```

### Build Portable .exe

- Windows - Open Command Prompt / Powershell as Administrator

```bash
bun run build
```

Output: `dist/Timex.exe` — no installation needed, just double-click.

## 📁 Project Structure

```
timex/
├── assets/
│   └── icon.png              App icon (256×256)
├── main.js                   Main process (timer, tray, windows)
├── preload.js                Main window IPC bridge
├── preload-widget.js         Widget window IPC bridge
├── index.html                Main window UI
├── widget.html               Floating widget UI
├── package.json              Config & build settings
├── .gitignore                Git ignore rules
└── README.md                 This file
```

## 🖱️ Tray Menu (Right-click)

| Option | When |
|---|---|
| ⏸ Pause / ▶ Resume | Timer running |
| ⏹ Stop | Timer running |
| 🔄 Restart | Timer running |
| 🔼 Show / 🔽 Hide Widget | Always |
| 📐 Widget Size | Always |
| 📺 Open Window | Always |
| ❌ Quit | Always |

## 📐 Widget Sizes

| Preset | Dimensions | Font Size |
|---|---|---|
| Tiny | 170 × 50 | ~23px |
| Small | 220 × 64 | ~29px |
| **Medium** | **300 × 84** | **38px** |
| Large | 400 × 112 | ~51px |
| Extra Large | 520 × 145 | ~66px |
| Huge | 660 × 180 | ~81px |

Resize methods:
- **Drag** the bottom-right handle
- **Scroll** mouse wheel over widget
- **Click** size dots at bottom of widget
- **Tray menu** → Widget Size

## 🔊 Alarm Sounds

| Sound | Style |
|---|---|
| 🚨 Alarm | Urgent two-tone square wave |
| 🔔 Beep | 3 clean sine beeps |
| 🎵 Chime | Rising C major chord |
| ⌚ Digital | Retro watch clicks |
| 🌊 Gentle | Soft harmonic tones |
| 🚑 Siren | Rising/falling sawtooth |
| 📁 Custom | Your own `.mp3` `.wav` `.ogg` `.flac` `.m4a` `.aac` |
| 🔇 None | Visual alert only |

- **Volume** slider (0–100%)
- **Loop** toggle — repeat with 2s gap until dismissed
- **Preview** button to test sounds
- Settings panel collapsed by default (click to expand)


## ⚙️ Technical Details

- **Zero native dependencies** — pixel font + PNG encoder built from scratch
- **Drift-corrected timer** — uses `Date.now()` instead of naive `setInterval`
- **Icon LRU cache** — max 8 cached icons, reuses buffer allocations
- **Dirty-flag DOM updates** — only writes to DOM when values change
- **Debounced config saves** — batches disk writes (500ms)
- **Single audio source** — alarm plays in main window only (no double sound)
- **Reusable IPC payload** — single object reused per tick (zero allocations)
- **Pre-computed corner mask** — `Uint8Array` for fast icon rendering

## 🏗️ Build Options

```bash
# Development
bun start

# Portable .exe (no installer)
bun run build
```

Build output lands in `dist/`:
```
dist/
├── Timex.exe                  Portable executable
├── win-unpacked/              Unpacked app
└── builder-effective-config.yaml
```

## 📋 Requirements

| | Minimum |
|---|---|
| **OS** | Windows 10+ |
| **Node.js** | 18+ (for building) |
| **Disk** | ~200MB (Electron runtime) |
| **RAM** | ~80MB at runtime |

## 🤝 Contributing

1. Fork the repo
2. Create a branch (`git checkout -b feature/my-feature`)
3. Commit changes (`git commit -am 'Add feature'`)
4. Push (`git push origin feature/my-feature`)
5. Open a Pull Request

## 📄 License

MIT License © [Shakir Samoon](https://github.com/shakirsamoon/timex/blob/master/LICENSE)

---

<div align="center">

**Timex** — Because time matters. ⏱

</div>