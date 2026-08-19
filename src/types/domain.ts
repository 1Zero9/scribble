/**
 * Scribble domain model.
 *
 * These types describe the application's own vocabulary. They are deliberately
 * independent of the storage schema: repositories translate between rows and
 * these objects, so the persistence layer can change (for example to add
 * encryption) without touching the user interface.
 */

/** ISO-8601 UTC timestamp, e.g. `2026-08-18T09:15:00.000Z`. */
export type Timestamp = string;

/** RFC 4122 UUID. Scribble never uses sequential public identifiers. */
export type Uuid = string;

export const GRID_TYPES = ['dots', 'lines', 'blank'] as const;
export type GridType = (typeof GRID_TYPES)[number];

export const PAD_BACKGROUNDS = ['paper', 'plain'] as const;
export type PadBackground = (typeof PAD_BACKGROUNDS)[number];

export const NOTE_COLOURS = ['neutral', 'sand', 'sage', 'sky', 'rose', 'lilac', 'slate'] as const;
export type NoteColour = (typeof NOTE_COLOURS)[number];

/** Human-readable labels, so colour is never the only carrier of meaning. */
export const NOTE_COLOUR_LABELS: Record<NoteColour, string> = {
  neutral: 'Neutral',
  sand: 'Sand',
  sage: 'Sage',
  sky: 'Sky',
  rose: 'Rose',
  lilac: 'Lilac',
  slate: 'Slate',
};

export const ITEM_TYPES = ['text', 'checklist', 'link', 'image', 'file'] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  text: 'Note',
  checklist: 'Checklist',
  link: 'Link',
  image: 'Image',
  file: 'File reference',
};

export interface Pad {
  id: Uuid;
  /** Naming a pad is always optional; `null` means the user has not named it. */
  name: string | null;
  background: PadBackground;
  gridType: GridType;
  snapEnabled: boolean;
  zoom: number;
  viewportX: number;
  viewportY: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  archivedAt: Timestamp | null;
  deletedAt: Timestamp | null;
}

export interface ChecklistEntry {
  id: Uuid;
  text: string;
  done: boolean;
}

/**
 * How a referenced file relates to Scribble.
 * `reference` — Scribble stores only the path. The original file is untouched.
 * `copy`      — Scribble holds its own copy inside the application data folder.
 */
export type AssetMode = 'reference' | 'copy';

export type ItemContent =
  | { kind: 'text'; html: string }
  | { kind: 'checklist'; title: string; entries: ChecklistEntry[] }
  | { kind: 'link'; url: string; title: string; note: string }
  | {
      kind: 'image';
      /** Path relative to the Scribble assets folder, or a `data:` URL in browser mode. */
      source: string;
      mode: AssetMode;
      mimeType: string;
      alt: string;
      byteSize: number;
    }
  | {
      kind: 'file';
      path: string;
      fileName: string;
      mode: AssetMode;
      mimeType: string;
      byteSize: number;
      note: string;
    };

export interface Item {
  id: Uuid;
  padId: Uuid;
  itemType: ItemType;
  content: ItemContent;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  colour: NoteColour;
  pinned: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  archivedAt: Timestamp | null;
  deletedAt: Timestamp | null;
}

export interface InkPoint {
  x: number;
  y: number;
  /** Normalised 0–1 pressure. Devices without pressure report 0.5. */
  pressure: number;
}

export interface InkStroke {
  id: Uuid;
  padId: Uuid;
  colour: string;
  width: number;
  points: InkPoint[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
  deletedAt: Timestamp | null;
}

export interface SettingRecord {
  key: string;
  value: string;
  updatedAt: Timestamp;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export const MIN_ITEM_WIDTH = 140;
export const MIN_ITEM_HEIGHT = 80;
export const DEFAULT_ITEM_WIDTH = 260;
export const DEFAULT_ITEM_HEIGHT = 160;
export const GRID_SIZE = 24;
export const MIN_ZOOM = 0.4;
export const MAX_ZOOM = 2.5;
