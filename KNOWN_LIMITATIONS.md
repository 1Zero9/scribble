# Known limitations

Scribble 0.1.0 is a working prototype, not a finished product. This is an honest list of what is incomplete, what is deliberately out of scope, and what a reader should not assume.

---

## 1. Requires a Rust toolchain to build the desktop application

The complete Tauri shell is in this repository — tray icon, single instance, window behaviour, capabilities and bundle configuration — but building it needs Rust and the Visual Studio C++ build tools. `README.md` gives the exact `winget` commands.

**This machine did not have Rust installed when the prototype was written**, so `npm run tauri:build` has not been executed here. Everything that does not depend on Rust has been verified: type checking, linting, formatting, 126 unit tests, 14 Playwright interface tests and a production web build all pass, and the interface has been exercised end to end in a browser using the same React code, the same repositories and the same SQLite schema.

The tray icon, global shortcut and file dialogs therefore have **not been tested on a real Windows desktop build**. They should be the first thing checked after `npm run tauri:build`.

## 2. Data at rest is not encrypted

This is the most significant gap. The SQLite file sits in `%APPDATA%\uk.scribble.app\` protected only by Windows file permissions and whatever full-disk encryption the machine has.

The repository layer exists precisely so this can be fixed without touching the interface: every component talks to `PadRepository`, `ItemRepository`, `InkRepository` and `SettingsRepository`, and the `Database` port has a single, small surface. Adding SQLCipher or application-layer encryption with protected key storage is an additive change.

Recorded as **T6** in `docs/THREAT_MODEL.md`.

## 3. The application lock is a privacy screen, not security

Auto-lock hides the deskpad after a period of inactivity. It has no passphrase and does not protect the database file. It defends against someone glancing at the screen; it does not defend against someone with access to the machine. The interface says this in as many words, and it should never be described otherwise.

## 4. Dictation is not local, and is therefore switched off

The Dictate control, the capability detection and the `DictationEngine` abstraction are complete. The only engine available is the browser's speech recognition, which normally streams audio to a remote service and cannot be verified as on-device. Scribble therefore reports it as external and keeps dictation disabled by default.

Adding genuine offline dictation means implementing `DictationEngine` with `processing: 'local'`. No interface change is required.

## 5. Transactions in the desktop build are best-effort

The Tauri SQL plugin pools connections and exposes no transaction handle, so `Database.transaction` on the desktop adapter runs its statements in order rather than inside a single `BEGIN`/`COMMIT`. Every write Scribble performs is individually idempotent, so a partial failure is recoverable, but a multi-statement operation is not strictly atomic there. The browser and Node adapters use real transactions, and the storage tests run against real transactions.

## 6. Import decompresses the whole bundle in memory

Bundle size is capped and the JSON is schema-validated before anything is written, but a deliberately crafted archive could still consume memory during decompression. A streaming reader with an uncompressed-size check would close this. Recorded as **T4** in `docs/THREAT_MODEL.md`.

## 7. Binaries are unsigned

No code signing certificate is configured, so Windows SmartScreen will warn on installation and the publisher cannot be verified. This must be resolved before any distribution beyond controlled testing.

## 8. Dropped files in the browser build have no real path

A browser drop exposes a file's name but not its location, so a file-reference card created that way records the name only. In the desktop build, and when using "Add a file reference", the full path is recorded.

## 9. Search is a linear scan

Search loads recent, archived and optionally deleted material into memory and matches substrings. This is fast, predictable and never hides a note the user knows they typed, but it is not a ranked index. At tens of thousands of notes it would need SQLite FTS5. Semantic search is explicitly out of scope.

## 10. Ink is drawn but not selected

Pen, eraser, colour, width, pressure, undo and redo all work, and strokes are stored as vectors that survive a restart. Selecting existing strokes to move, recolour or resize them is not implemented — the eraser is the only way to change a stroke after it is drawn.

## 11. The Organise rules are simple, and English only

The rules are deterministic regular expressions plus a shared-word comparison. They are British English only. The "people" rule matches two consecutive capitalised words, so it finds "Sarah Whitfield" and also "Project Falcon", and misses a single first name. The panel presents output as suggestions to review, never as conclusions. `docs/AI_GOVERNANCE.md` lists these limitations for users as well as developers.

## 12. Rich text is intentionally limited

Headings, bold, italic, bulleted and numbered lists, links, blockquote and inline code. No tables, images inside text, font choices or colours. The allowlist is small on purpose: every tag added is a tag the sanitiser must be re-reviewed for.

## 13. Accessibility has been built for, but not audited

Full keyboard operation, visible focus, accessible names, live-region announcements, keyboard alternatives for dragging and resizing, reduced-motion support, forced-colours support, 44px touch targets and no meaning carried by colour alone are all implemented and partly covered by tests. **No audit with real assistive technology or real users has taken place**, and WCAG 2.2 AA conformance is a target, not a verified claim.

## 14. No packaging extras

No auto-update, no crash reporting, no telemetry, no installer customisation beyond a per-user NSIS and MSI build, and no enterprise policy support. All of these are deliberate omissions for a local-first prototype.

## 15. Not tested at scale

The prototype has been exercised with tens of notes. Behaviour with thousands of notes on a single pad, or very long ink strokes, has not been measured. The most likely first bottleneck is that every card on a pad renders at once, with no virtualisation.

---

## What this prototype is for

Validating the core idea on real working days:

- Does summon-and-dismiss feel right?
- Is click-to-type genuinely faster than the alternatives?
- Are multiple pads plus a Drawer enough organisation?
- Does anyone actually want the Organise panel?

Everything above is secondary to those questions.
