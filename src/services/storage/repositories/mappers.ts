import {
  GRID_TYPES,
  ITEM_TYPES,
  NOTE_COLOURS,
  PAD_BACKGROUNDS,
  type GridType,
  type InkPoint,
  type InkStroke,
  type Item,
  type ItemContent,
  type ItemType,
  type NoteColour,
  type Pad,
  type PadBackground,
} from '@/types/domain';
import { fromSqlBool } from '../database';
import { clampZoom } from '@/lib/geometry';
import { sanitiseHtml } from '@/services/security/sanitise';

/**
 * Row <-> domain mapping.
 *
 * Rows are treated as untrusted: a database file can be edited by hand or
 * restored from an old export, so every value is validated and coerced back
 * into the domain type rather than cast.
 */

export interface PadRow {
  id: string;
  name: string | null;
  background: string;
  grid_type: string;
  snap_enabled: number;
  zoom: number;
  viewport_x: number;
  viewport_y: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  deleted_at: string | null;
}

export interface ItemRow {
  id: string;
  pad_id: string;
  item_type: string;
  content: string;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  z_index: number;
  colour: string;
  pinned: number;
  project: string | null;
  bundle_id: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  deleted_at: string | null;
}

export interface InkRow {
  id: string;
  pad_id: string;
  colour: string;
  width: number;
  points_json: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function num(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function toPad(row: PadRow): Pad {
  return {
    id: row.id,
    name: row.name === null || row.name === '' ? null : row.name,
    background: oneOf<PadBackground>(row.background, PAD_BACKGROUNDS, 'paper'),
    gridType: oneOf<GridType>(row.grid_type, GRID_TYPES, 'dots'),
    snapEnabled: fromSqlBool(row.snap_enabled),
    zoom: clampZoom(num(row.zoom, 1)),
    viewportX: num(row.viewport_x, 0),
    viewportY: num(row.viewport_y, 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
    deletedAt: row.deleted_at,
  };
}

/**
 * Parses stored item content. Unknown or malformed content degrades to an empty
 * text note rather than throwing, so one bad row cannot make a pad unopenable.
 */
export function parseItemContent(itemType: ItemType, raw: string): ItemContent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: 'text', html: '' };
  }
  if (typeof parsed !== 'object' || parsed === null) return { kind: 'text', html: '' };
  const value = parsed as Record<string, unknown>;

  switch (itemType) {
    case 'text':
      return { kind: 'text', html: sanitiseHtml(String(value.html ?? '')) };
    case 'checklist': {
      const entries = Array.isArray(value.entries) ? value.entries : [];
      return {
        kind: 'checklist',
        title: String(value.title ?? ''),
        entries: entries.slice(0, 500).map((entry, index) => {
          const record = (entry ?? {}) as Record<string, unknown>;
          return {
            id: String(record.id ?? `entry-${index}`),
            text: String(record.text ?? '').slice(0, 2000),
            done: record.done === true,
          };
        }),
      };
    }
    case 'link':
      return {
        kind: 'link',
        url: String(value.url ?? ''),
        title: String(value.title ?? ''),
        note: String(value.note ?? ''),
      };
    case 'image':
      return {
        kind: 'image',
        source: String(value.source ?? ''),
        mode: value.mode === 'reference' ? 'reference' : 'copy',
        mimeType: String(value.mimeType ?? 'image/png'),
        alt: String(value.alt ?? ''),
        byteSize: num(value.byteSize, 0),
      };
    case 'file':
      return {
        kind: 'file',
        path: String(value.path ?? ''),
        fileName: String(value.fileName ?? 'Unknown file'),
        mode: value.mode === 'copy' ? 'copy' : 'reference',
        mimeType: String(value.mimeType ?? ''),
        byteSize: num(value.byteSize, 0),
        note: String(value.note ?? ''),
      };
  }
}

export function toItem(row: ItemRow): Item {
  const itemType = oneOf<ItemType>(row.item_type, ITEM_TYPES, 'text');
  return {
    id: row.id,
    padId: row.pad_id,
    itemType,
    content: parseItemContent(itemType, row.content),
    x: num(row.position_x, 0),
    y: num(row.position_y, 0),
    width: num(row.width, 260),
    height: num(row.height, 160),
    zIndex: Math.trunc(num(row.z_index, 0)),
    colour: oneOf<NoteColour>(row.colour, NOTE_COLOURS, 'neutral'),
    pinned: fromSqlBool(row.pinned),
    project: row.project === null || row.project.trim() === '' ? null : row.project,
    bundleId: row.bundle_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
    deletedAt: row.deleted_at,
  };
}

export function parseInkPoints(raw: string): InkPoint[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .slice(0, 20_000)
    .map((point) => {
      const record = (point ?? {}) as Record<string, unknown>;
      return {
        x: num(record.x, 0),
        y: num(record.y, 0),
        pressure: Math.min(1, Math.max(0, num(record.pressure, 0.5))),
      };
    })
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
}

export function toInkStroke(row: InkRow): InkStroke {
  return {
    id: row.id,
    padId: row.pad_id,
    colour: row.colour,
    width: num(row.width, 2),
    points: parseInkPoints(row.points_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}
