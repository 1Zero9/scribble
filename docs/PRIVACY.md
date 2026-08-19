# Privacy by design — Scribble

**Status:** early prototype, version 0.1.0
**Scope:** the Windows desktop application in this repository

Scribble holds the raw material of a working day: names, phone numbers, meeting comments, incident notes and commercially sensitive fragments. The privacy position is therefore part of the product, not an implementation detail.

This document describes the controls that are actually implemented. It does **not** claim compliance with the UK GDPR, the EU GDPR or the EU AI Act. Sections marked **Still to assess** identify work that an organisation would need to complete before deploying Scribble.

---

## 1. The principle

> Nothing leaves the device unless the person using Scribble deliberately exports it.

There is no account, no server, no synchronisation and no telemetry. Scribble works with the network cable unplugged, and behaves identically whether or not the machine is online.

---

## 2. What Scribble stores

| Data | Where | Why |
|---|---|---|
| Pads (name, grid, snap, zoom, viewport, timestamps) | `%APPDATA%\uk.scribble.app\scribble.db` | To reopen exactly as the user left it |
| Notes (type, content, position, size, colour, pinned, timestamps) | Same database | The notes themselves |
| Pen strokes (colour, width, vector points) | Same database | So ink stays editable |
| Preferences (theme, grid, shortcut, retention, auto-lock) | Same database | To remember choices |
| Images the user added | `%APPDATA%\uk.scribble.app\assets\` | Copies, so a note does not break when the original moves |
| Structured local log | Memory only, cleared when the app closes | Diagnostics |

Scribble writes nothing into the source repository, nothing into a temporary folder, and nothing to any network location.

### Data minimisation

- Scribble never asks for a name, an email address or any identifier.
- Notes require no title, folder, project, tag, priority or due date.
- Identifiers are random UUIDs, not sequential numbers, so a count of records cannot be inferred from an identifier.
- The structured log records event names and numeric counters only. Note content, file paths, URLs and free text are never logged. This is enforced by the log API's type signature, which accepts only numbers and booleans as data.

---

## 3. What Scribble does not do

| Not done | How that is assured |
|---|---|
| No account or authentication service | There is no sign-in code and no auth dependency |
| No cloud database or synchronisation | No network client of any kind is present |
| No analytics or telemetry | No analytics dependency; nothing is sent anywhere |
| No advertising | No advertising dependency |
| No external fonts | Only system fonts are named in `src/styles/tokens.css` |
| No background screen monitoring | Scribble has no screen-capture capability |
| No automatic clipboard monitoring | The clipboard is read only inside a `paste` event handler, which fires only when the user presses paste while the deskpad has focus |
| No automatic email or Teams access | No integration of any kind exists |
| No hidden network requests | An ESLint rule forbids `fetch` and `XMLHttpRequest`; the Content Security Policy restricts `connect-src` to `'self'` and the Tauri IPC channel; a Playwright test asserts that no external request is made during normal use |
| No remote content rendered in-app | `frame-src 'none'`; links are handed to the operating system's default browser |

---

## 4. User control

| Control | Where |
|---|---|
| Export everything | Settings → Export and import |
| Export a single pad | Settings → Export and import |
| Import a bundle (always as new pads) | Settings → Export and import |
| Delete everything | Settings → Delete everything, behind a confirmation |
| Restore something deleted by mistake | Drawer → Recently deleted |
| Permanently delete a single item | Drawer, behind a confirmation |
| Choose how long deleted material is kept | Settings → 7 to 365 days, default 30 |
| Automatic lock after inactivity | Settings → off, or 1 to 60 minutes |
| See where the data is stored | Settings → Privacy and data shows the exact path |
| Turn dictation off (it is off by default) | Settings → Dictation |

Retention is enforced on every start-up: anything soft-deleted longer ago than the configured period is permanently removed before the interface appears.

---

## 5. Transparency

- Settings contains a plain-language statement of what Scribble does and does not do, including the exact storage path.
- The Organise panel states, every time it is opened, that the analysis is deterministic, local and reviewable.
- Dictation reports honestly whether Scribble can confirm local processing. It refuses to imply local processing it cannot verify.
- File-reference cards say "File reference — not copied" so it is always clear whether Scribble holds a copy of something.
- Exports contain a `README.txt` explaining what is inside the bundle.

---

## 6. Still to assess

These are genuine gaps. They are listed rather than hidden.

1. **Encryption at rest.** The SQLite file is not encrypted by Scribble. It inherits whatever protection the device provides, such as BitLocker and Windows file permissions. A repository layer exists specifically so encryption can be added without changing the interface, but it has not been implemented. See `KNOWN_LIMITATIONS.md`.
2. **Application lock strength.** The auto-lock is a privacy screen within the running window. It does not protect the database file and can be bypassed by anyone with access to the file system.
3. **Code signing.** The prototype is unsigned. Signing the executable and installers is required before any distribution.
4. **Data protection impact assessment.** A DPIA screening would be needed for organisational deployment, covering the categories of personal data users are likely to capture.
5. **Records of processing.** If Scribble were deployed by an organisation, that organisation would be the controller for whatever staff record in it, and would need its own records of processing.
6. **Backup and recovery policy.** Scribble has no backup mechanism beyond manual export. An organisation would need to decide whether that is acceptable.
7. **Third-party dependency review.** `npm audit` runs, but no formal software bill of materials is produced or maintained yet.

---

## 7. Contact for this document

This is an internal prototype document intended for discussion. It should be reviewed by whoever holds data-protection responsibility before Scribble is used with real working material.
