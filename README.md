# Scribble

A private, local-first digital deskpad for Windows.

**Capture first. Organise later.**

Scribble gives you one always-ready surface for typed notes, checklists, pen input, pasted content and dropped files — without asking you to decide what a thought _is_ before you write it down. It replaces the scattered Notepad files, unsent emails, Teams messages, sticky notes and scraps of paper that build up during a working day.

Everything stays on your machine. There is no account, no cloud service, no API key and no internet connection required.

---

## Contents

- [What it does](#what-it-does)
- [Requirements](#requirements)
- [Setup on Windows](#setup-on-windows)
- [Running in development](#running-in-development)
- [Testing](#testing)
- [Building and packaging](#building-and-packaging)
- [Where your data lives](#where-your-data-lives)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Project structure](#project-structure)
- [Privacy and security](#privacy-and-security)
- [Documentation](#documentation)

---

## What it does

**Summon and dismiss.** Scribble lives in the system tray. Press `Ctrl + Shift + Space` (configurable) or click the tray icon to bring the deskpad forward. Press `Escape` to send it away and return to whatever was underneath. It reopens exactly as you left it.

**Capture.** Double-click anywhere to start typing. Drag in text, links, images or files. Paste a screenshot. Draw with a pen. Add a checklist. Nothing needs a title, a folder, a project, a tag or a due date.

**Recall.** Notes carry timestamps automatically. Search runs across every pad. Older and deleted material waits in the Drawer.

**Organise — only when you want to.** A local, rules-based organiser suggests groupings such as actions, decisions, reminders, questions and people. You review every suggestion, and your original notes are never rewritten.

---

## Requirements

| Requirement                         | Version                | Notes                                                               |
| ----------------------------------- | ---------------------- | ------------------------------------------------------------------- |
| Windows                             | 10 (1809+) or 11       | 64-bit                                                              |
| Node.js                             | 20.19+ or 22.12+       | `node -v`                                                           |
| Rust                                | 1.77.2+ (stable, MSVC) | Needed to build the desktop application                             |
| Microsoft Visual Studio Build Tools | 2022                   | "Desktop development with C++" workload                             |
| WebView2 Runtime                    | Latest                 | Pre-installed on Windows 11; the installer fetches it on Windows 10 |

### Installing the prerequisites

Run these in PowerShell. **Restart your terminal afterwards** so the new tools appear on `PATH`.

```powershell
winget install --id Microsoft.VisualStudio.2022.BuildTools --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
winget install --id Rustlang.Rustup
winget install --id OpenJS.NodeJS.LTS
winget install --id Microsoft.EdgeWebView2Runtime
```

Then confirm:

```powershell
node -v
npm -v
rustc --version
cargo --version
```

> If `rustc` is not found after installing rustup, run `rustup default stable-x86_64-pc-windows-msvc`.

---

## Setup on Windows

```powershell
cd "C:\path\to\Scribble"
npm install
```

That is the whole setup. Rust dependencies are fetched automatically the first time you run or build the desktop application (the first build takes several minutes; later builds are fast).

---

## Running in development

### Desktop application (the real thing)

```powershell
npm run tauri:dev
```

This starts the Vite dev server and launches Scribble as a Windows desktop application with the tray icon, the global shortcut and SQLite storage in your application-data folder.

### Browser only (no Rust required)

```powershell
npm run dev
```

Then open <http://127.0.0.1:1420>.

This runs the same React application against a WebAssembly build of SQLite held in IndexedDB. It is intended for interface work and for the Playwright tests. The tray icon, global shortcut, file dialogs and protected application-data storage are **not** available in this mode, and Settings says so.

---

## Testing

```powershell
npm run typecheck     # strict TypeScript, no emit
npm run lint          # ESLint, including Scribble's own security rules
npm run format        # Prettier, write
npm run format:check  # Prettier, check only
npm test              # Vitest unit tests
npm run test:e2e      # Playwright interface tests
npm run verify        # format:check + lint + typecheck + test
npm run audit         # npm vulnerability check (high and above)
```

Before the first Playwright run:

```powershell
npm run test:e2e:install
```

**Unit tests** cover storage and migrations (against a real SQLite database via Node's built-in `node:sqlite`), grid and alignment mathematics, HTML sanitisation, path and file validation, organiser rules, export/import round-trips, autosave batching, search and ink geometry.

**Interface tests** cover creating, editing, moving, resizing, deleting and restoring notes, multiple pads, alignment, search, ink persistence, drag-and-drop, and a check that the application makes no network requests.

---

## Building and packaging

```powershell
npm run build          # type-check and build the web assets only
npm run tauri:build    # full Windows desktop build
```

`npm run tauri:build` produces installers in:

```
src-tauri\target\release\bundle\msi\Scribble_0.1.0_x64_en-US.msi
src-tauri\target\release\bundle\nsis\Scribble_0.1.0_x64-setup.exe
```

The NSIS installer is configured for a per-user install, so no administrator rights are needed.

### Code signing

The prototype is **not** signed. For any real distribution, sign both the executable and the installer with an organisational certificate and record the signing process. See `docs/THREAT_MODEL.md`.

---

## Where your data lives

Scribble stores everything in the operating system's protected application-data location — never inside this repository:

```
%APPDATA%\uk.scribble.app\scribble.db      SQLite database: pads, notes, ink, settings
%APPDATA%\uk.scribble.app\assets\          Copies of images you added
```

The exact path is shown in **Settings → Privacy and data**.

**Export** produces a plain `.zip` containing:

```
manifest.json          format, version and counts
data/scribble.json     the complete structured export
markdown/<pad>.md      a readable Markdown copy of each pad
assets/                copies of any images
README.txt             what the bundle contains
```

**Import** always creates _new_ pads, so nothing you already have is overwritten.

**Delete all data** removes every pad, note, pen stroke and preference from the device.

---

## Keyboard shortcuts

Everything in Scribble can be reached from the keyboard. Press `Ctrl + ?` in the application for the full list.

| Keys                                              | Action                                          |
| ------------------------------------------------- | ----------------------------------------------- |
| `Ctrl + Shift + Space`                            | Show or hide Scribble (configurable)            |
| `Escape`                                          | Close a panel, finish editing, or hide Scribble |
| Double-click the pad                              | Create a note where you clicked                 |
| `N` / `C`                                         | New note / new checklist                        |
| `P` / `E` / `V`                                   | Pen / eraser / select                           |
| `Ctrl + Enter`                                    | Finish editing the current note                 |
| Arrow keys                                        | Move the focused note by one grid step          |
| `Shift` + arrow keys                              | Resize the focused note                         |
| `Alt` + arrow keys                                | Move by one pixel, ignoring the grid            |
| `Enter` or `F2`                                   | Edit the focused note                           |
| `Delete`                                          | Delete the selected notes                       |
| `Shift + A`                                       | Select every note on the pad                    |
| `Shift` + click                                   | Add a note to the selection                     |
| `Alt` + drag                                      | Move or resize without snapping                 |
| `Ctrl + F` / `Ctrl + D` / `Ctrl + G` / `Ctrl + ,` | Search / Drawer / Organise / Settings           |
| `Ctrl + Shift + N`                                | New pad                                         |
| `Ctrl + Z`                                        | Undo ink (while the pen is active)              |
| `Ctrl` + scroll                                   | Zoom the pad                                    |

---

## Project structure

```
src/
  app/            shell, error boundaries, keyboard map, lock screen
  components/     small shared UI primitives
  features/
    deskpad/      surface, grid, viewport, selection, top bar, capture toolbar
    notes/        note cards, editors, formatting
    ink/          pen layer and stroke geometry
    drawer/       retrieval panel
    organiser/    review panel
    search/       search panel
    settings/     settings and privacy status
    dictation/    dictate control
  services/       no React below this line
    storage/      Database port, migrations, repositories
    security/     sanitisation, path and file validation
    assets/       validated local asset storage
    organiser/    deterministic rules behind an interface
    exportImport/ bundle writer and reader, schema validation
    dictation/    capability detection and service abstraction
    desktop/      window, tray and global shortcut
    logging/      structured, redacted local logging
  store/          Zustand stores
  lib/            pure helpers: geometry, ids, time, text
  types/          domain model
src-tauri/        Rust shell: tray, single instance, window
e2e/              Playwright tests
docs/             threat model, data flow, privacy, AI governance
```

**Architectural rules**

- The interface never touches SQL. It calls repository interfaces, so storage can later be encrypted or replaced without changing a component.
- All colour comes from design tokens in `src/styles/tokens.css`. No component hard-codes a colour.
- Pure logic lives outside React and is unit tested directly.

---

## Privacy and security

Scribble is built to keep your notes on your machine:

- No account, sign-in or authentication service
- No cloud database or synchronisation
- No analytics, telemetry or advertising
- No external fonts or other remote assets
- No background screen, clipboard, email or Teams monitoring — the clipboard is read only when you press paste
- No hidden network requests; a lint rule forbids `fetch` and a Playwright test asserts that no external request is made
- Dropped files are never executed, and executable file types are refused
- Links open in your own browser; Scribble never renders remote web content
- Strict TypeScript, a restrictive Content Security Policy, and a minimal Tauri permission set with no shell access
- All rendered HTML passes through an auditable allowlist sanitiser; `dangerouslySetInnerHTML` is banned by lint rule

Scribble does not claim to be GDPR compliant, EU AI Act compliant or fully secure. `docs/` describes the controls that are in place and what still needs assessment.

---

## Documentation

| File                                           | Contents                                                  |
| ---------------------------------------------- | --------------------------------------------------------- |
| [BUILD_PLAN.md](BUILD_PLAN.md)                 | How this prototype was structured and delivered           |
| [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md)   | What is incomplete, and what is deliberately out of scope |
| [docs/PRIVACY.md](docs/PRIVACY.md)             | Privacy by design summary                                 |
| [docs/DATA_FLOW.md](docs/DATA_FLOW.md)         | Where data comes from, where it goes                      |
| [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md)   | Assets, threats, controls and residual risk               |
| [docs/AI_GOVERNANCE.md](docs/AI_GOVERNANCE.md) | The organiser and dictation, and how they are governed    |
| [docs/EXPORT_FORMAT.md](docs/EXPORT_FORMAT.md) | The `.scribble.zip` bundle format                         |

---

## Licence

Not yet determined. This is an early prototype for discussion and user testing.
