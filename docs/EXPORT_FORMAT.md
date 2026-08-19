# The Scribble export format

**Format identifier:** `scribble.export`
**Version:** 1
**Container:** a standard `.zip` archive

An export is deliberately boring: a zip file containing JSON, Markdown and ordinary image files. It can be opened with Windows Explorer, read with a text editor and parsed with any language. Nothing in it is proprietary, obfuscated or dependent on Scribble to be useful.

---

## Contents

```
scribble-export-2026-08-18.zip
├── manifest.json          what this bundle is, and how much is in it
├── data/
│   └── scribble.json      the complete structured export
├── markdown/
│   ├── monday-3f2a1b9c.md a readable rendering of each pad
│   └── ...
├── assets/
│   ├── 8b1d....png        copies of images used by image cards
│   └── ...
└── README.txt             a plain-language explanation
```

## `manifest.json`

```json
{
  "format": "scribble.export",
  "version": 1,
  "application": "Scribble",
  "exportedAt": "2026-08-18T15:04:00.000Z",
  "counts": { "pads": 3, "items": 41, "ink": 12, "assets": 4 },
  "notice": "This bundle contains your Scribble data in an open format. …"
}
```

## `data/scribble.json`

The authoritative copy. Its shape is defined in code by
`src/services/exportImport/schema.ts`, and that schema is what an import is validated against.

```json
{
  "format": "scribble.export",
  "version": 1,
  "exportedAt": "2026-08-18T15:04:00.000Z",
  "scope": "all",
  "pads": [
    {
      "id": "…", "name": "Monday", "background": "paper",
      "gridType": "dots", "snapEnabled": true,
      "zoom": 1, "viewportX": 0, "viewportY": 0,
      "createdAt": "…", "updatedAt": "…",
      "archivedAt": null, "deletedAt": null
    }
  ],
  "items": [
    {
      "id": "…", "padId": "…", "itemType": "text",
      "content": { "kind": "text", "html": "<p>Call the supplier</p>" },
      "x": 24, "y": 48, "width": 260, "height": 160,
      "zIndex": 1, "colour": "sand", "pinned": false,
      "createdAt": "…", "updatedAt": "…",
      "archivedAt": null, "deletedAt": null
    }
  ],
  "ink": [
    {
      "id": "…", "padId": "…",
      "colour": "var(--sb-ink-1)", "width": 3,
      "points": [{ "x": 0, "y": 0, "pressure": 0.5 }],
      "createdAt": "…", "updatedAt": "…", "deletedAt": null
    }
  ],
  "settings": [{ "key": "theme", "value": "light" }],
  "assets": [{ "source": "assets/8b1d….png", "file": "8b1d….png" }]
}
```

### `content` by `itemType`

| `itemType` | `content` |
|---|---|
| `text` | `{ "kind": "text", "html": "…" }` — a small, sanitised HTML fragment |
| `checklist` | `{ "kind": "checklist", "title": "…", "entries": [{ "id", "text", "done" }] }` |
| `link` | `{ "kind": "link", "url": "…", "title": "…", "note": "…" }` |
| `image` | `{ "kind": "image", "source": "assets/…", "mode": "copy", "mimeType": "…", "alt": "…", "byteSize": 0 }` |
| `file` | `{ "kind": "file", "path": "…", "fileName": "…", "mode": "reference", "mimeType": "…", "byteSize": 0, "note": "…" }` |

## `markdown/`

One document per pad, ordered top-to-bottom then left-to-right, so it reads roughly the way the pad looks. Checklists become GitHub-style task lists. Pen strokes are noted but not drawn, because they are vector data rather than text; they remain intact in `data/scribble.json`.

---

## Deliberate decisions

**The date and clock are never included.** They are ambient context for the person at the desk, not part of their notes. The `exportedAt` timestamp refers to the export itself.

**File references are references.** A `file` card stores a path. The original file is *not* copied into the bundle, and the Markdown says so explicitly. Only images are copied.

**Ink stays as vectors.** Strokes are never flattened into an image, so they remain editable after a round trip.

**Import never overwrites.** Every identifier is regenerated on import, so a bundle always arrives as new pads. Importing the same bundle twice gives two independent copies rather than silently replacing work. Settings inside a bundle are ignored.

**Everything is validated first.** The JSON is checked against the schema before a single row is written. If validation fails, nothing at all is imported.

---

## Reading a bundle without Scribble

```powershell
Expand-Archive scribble-export-2026-08-18.zip -DestinationPath .\scribble
Get-Content .\scribble\data\scribble.json | ConvertFrom-Json
```

Or simply open the files in `markdown/` in any text editor.

---

## Versioning

`version` will increase if the structure changes incompatibly. An importer must reject a bundle whose `format` is not `scribble.export`, or whose `version` it does not recognise, rather than attempt a partial import.
