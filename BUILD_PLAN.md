# Scribble — Build Plan

A private, local-first digital deskpad for Windows. **Capture first. Organise later.**

## Approach

Vertical slices. Each slice leaves the repository in a working, type-checked, linted and tested state.

| #   | Slice                              | Outcome                                                                                        |
| --- | ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1   | Tauri shell + secure configuration | Tauri 2 app, restrictive CSP, minimal capabilities, strict TypeScript, Vite + React + Tailwind |
| 2   | Local SQLite storage               | Migration runner, repositories, `Database` port with Tauri / browser / Node adapters           |
| 3   | Single deskpad                     | Warm surface, configurable dot/line/blank grid, pan and zoom, viewport persistence             |
| 4   | Text note creation                 | Click-to-create, sanitised rich text, autosave, `Ctrl + Enter` to finish                       |
| 5   | Drag, resize, snap-to-grid         | Pointer and keyboard equivalents, `Alt` to bypass snapping                                     |
| 6   | Autosave and state restoration     | Debounced writes, viewport and pad restored on reopen                                          |
| 7   | Multiple pads and Drawer           | Create/duplicate/rename/archive/delete/restore, retrieval-focused Drawer                       |
| 8   | Drag-and-drop and paste            | Text, URL, image, file-reference cards; validated types and sizes                              |
| 9   | Ink                                | Pointer Events, pressure, vector stroke storage, eraser, undo/redo                             |
| 10  | Search, Organise, export/import    | Local search, deterministic organiser suggestions, `.scribble.zip` bundles                     |
| 11  | Tray, global shortcut, packaging   | Tray toggle, `Ctrl + Shift + Space`, MSI/NSIS bundles                                          |
| 12  | Tests and documentation            | Vitest units, Playwright UI tests, README and `docs/`                                          |

## Architecture

```
src/
  app/            application shell, error boundaries, providers, keyboard map
  features/
    deskpad/      surface, grid, viewport, selection marquee, top bar, capture toolbar
    notes/        note cards, editors, formatting, alignment actions
    ink/          ink layer, stroke model, tools
    drawer/       retrieval panel
    organiser/    review panel
    search/       search palette
    settings/     settings panel, privacy status
  services/
    storage/      Database port, migrations, repositories  (no React)
    assets/       validated local asset storage
    dictation/    capability detection + service abstraction
    organiser/    deterministic rules engine behind an interface
    exportImport/ bundle writer/reader with schema validation
    logging/      structured, redacted local logging
    security/     sanitisation, path and file validation
  store/          Zustand stores (UI + document state only)
  lib/            pure helpers: grid maths, ids, time, colour
src-tauri/        Rust shell: tray, global shortcut, single instance
```

**Rules**

- UI never touches SQL. It calls repository interfaces only, so storage can later be encrypted or swapped.
- Every service is defined as a TypeScript interface first, then implemented.
- Pure logic (grid maths, sanitisation, organiser rules, export/import) lives outside React and is unit tested.
- All colour comes from design tokens in `src/styles/tokens.css`. No hard-coded hex in components.

## Non-goals for this prototype

Cloud sync, accounts, telemetry, cloud AI, collaboration, folders/projects/mandatory tags, mobile.

## Definition of done per slice

`npm run format` → `npm run lint` → `npm run typecheck` → `npm run test` → fix before continuing.
