import { z } from 'zod';
import { GRID_TYPES, ITEM_TYPES, NOTE_COLOURS, PAD_BACKGROUNDS } from '@/types/domain';

/**
 * The Scribble export format.
 *
 * A `.scribble.zip` bundle is an open, documented container:
 *
 *   manifest.json         format identifier, version, counts, export time
 *   data/scribble.json    the complete structured data (this schema)
 *   markdown/<pad>.md     a readable Markdown rendering of each pad
 *   assets/<file>         copies of any images the pads reference
 *
 * Everything imported is validated against this schema before a single row is
 * written, and unknown properties are stripped rather than trusted.
 */

export const EXPORT_FORMAT = 'scribble.export';
export const EXPORT_VERSION = 1;

const isoDate = z.string().min(1).max(40);
const uuid = z.string().min(1).max(64);

export const padExportSchema = z.object({
  id: uuid,
  name: z.string().max(200).nullable(),
  background: z.enum(PAD_BACKGROUNDS),
  gridType: z.enum(GRID_TYPES),
  snapEnabled: z.boolean(),
  zoom: z.number().finite(),
  viewportX: z.number().finite(),
  viewportY: z.number().finite(),
  createdAt: isoDate,
  updatedAt: isoDate,
  archivedAt: isoDate.nullable(),
  deletedAt: isoDate.nullable(),
});

export const itemExportSchema = z.object({
  id: uuid,
  padId: uuid,
  itemType: z.enum(ITEM_TYPES),
  /** Content is re-validated and sanitised by the storage mappers on load. */
  content: z.record(z.string(), z.unknown()),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().min(0).max(20_000),
  height: z.number().finite().min(0).max(20_000),
  zIndex: z.number().int(),
  colour: z.enum(NOTE_COLOURS),
  pinned: z.boolean(),
  /** Optional so bundles exported before this field existed still import. */
  project: z.string().max(80).nullable().optional(),
  createdAt: isoDate,
  updatedAt: isoDate,
  archivedAt: isoDate.nullable(),
  deletedAt: isoDate.nullable(),
});

export const inkExportSchema = z.object({
  id: uuid,
  padId: uuid,
  colour: z.string().max(32),
  width: z.number().finite().min(0).max(200),
  points: z
    .array(
      z.object({
        x: z.number().finite(),
        y: z.number().finite(),
        pressure: z.number().min(0).max(1),
      }),
    )
    .max(20_000),
  createdAt: isoDate,
  updatedAt: isoDate,
  deletedAt: isoDate.nullable(),
});

export const scribbleExportSchema = z.object({
  format: z.literal(EXPORT_FORMAT),
  version: z.literal(EXPORT_VERSION),
  exportedAt: isoDate,
  /** Present only when a single pad was exported. */
  scope: z.enum(['all', 'pad']),
  pads: z.array(padExportSchema).max(10_000),
  items: z.array(itemExportSchema).max(200_000),
  ink: z.array(inkExportSchema).max(200_000),
  /** Preferences are exported for convenience; importing them is opt-in. */
  settings: z.array(z.object({ key: z.string().max(80), value: z.string().max(4000) })).max(500),
  /** Asset file names present in the bundle, keyed by their stored source path. */
  assets: z.array(z.object({ source: z.string().max(400), file: z.string().max(200) })).max(10_000),
});

export type ScribbleExport = z.infer<typeof scribbleExportSchema>;

export const manifestSchema = z.object({
  format: z.literal(EXPORT_FORMAT),
  version: z.literal(EXPORT_VERSION),
  application: z.string().max(60),
  exportedAt: isoDate,
  counts: z.object({
    pads: z.number().int().min(0),
    items: z.number().int().min(0),
    ink: z.number().int().min(0),
    assets: z.number().int().min(0),
  }),
  notice: z.string().max(500),
});

export type ExportManifest = z.infer<typeof manifestSchema>;
