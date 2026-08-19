import { unzipSync, zipSync } from 'fflate';
import type { InkStroke, Item, Pad, Uuid } from '@/types/domain';
import { newId } from '@/lib/ids';
import { now } from '@/lib/time';
import { createLogger } from '@/services/logging/logger';
import { MAX_IMPORT_BYTES, safeAssetFileName } from '@/services/security/validation';
import type { Storage } from '@/services/storage';
import { assetService } from '@/services/assets/assetService';
import { padMarkdownFileName, padToMarkdown } from './markdown';
import {
  EXPORT_FORMAT,
  EXPORT_VERSION,
  manifestSchema,
  scribbleExportSchema,
  type ExportManifest,
  type ScribbleExport,
} from './schema';

const log = createLogger('export');

const NOTICE =
  'This bundle contains your Scribble data in an open format. data/scribble.json holds the ' +
  'complete structured export, markdown/ holds a readable copy, and assets/ holds any images ' +
  'you added. File-reference cards store only a path: the original files are not included.';

export interface ExportBundle {
  bytes: Uint8Array;
  fileName: string;
  manifest: ExportManifest;
}

function encode(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/**
 * Builds a `.scribble.zip` bundle. Everything happens locally; the returned
 * bytes are handed to a file-save dialog and nothing else.
 */
export async function buildExport(
  storage: Storage,
  options: { padId?: Uuid } = {},
): Promise<ExportBundle> {
  const exportedAt = now();
  const allPads = await storage.pads.list({ includeArchived: true, includeDeleted: true });
  const pads = options.padId ? allPads.filter((pad) => pad.id === options.padId) : allPads;
  const padIds = new Set(pads.map((pad) => pad.id));

  const allItems = await storage.items.listAll({ includeArchived: true, includeDeleted: true });
  const items = allItems.filter((item) => padIds.has(item.padId));

  const ink: InkStroke[] = [];
  for (const pad of pads) ink.push(...(await storage.ink.listByPad(pad.id)));

  const files: Record<string, Uint8Array> = {};
  const assets: ScribbleExport['assets'] = [];
  const service = assetService();

  for (const item of items) {
    if (item.content.kind !== 'image' || item.content.mode !== 'copy') continue;
    try {
      const bytes = await service.read(item.content.source);
      const fileName = safeAssetFileName(item.content.source.split('/').pop() ?? `${item.id}.bin`);
      files[`assets/${fileName}`] = bytes;
      assets.push({ source: item.content.source, file: fileName });
    } catch {
      log.warn('export.asset.missing');
    }
  }

  const settings = (await storage.settings.all()).map(({ key, value }) => ({ key, value }));

  const data: ScribbleExport = {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt,
    scope: options.padId ? 'pad' : 'all',
    pads,
    items: items.map((item) => ({
      ...item,
      content: item.content as unknown as Record<string, unknown>,
    })),
    ink,
    settings,
    assets,
  };

  const manifest: ExportManifest = {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    application: 'Scribble',
    exportedAt,
    counts: { pads: pads.length, items: items.length, ink: ink.length, assets: assets.length },
    notice: NOTICE,
  };

  files['manifest.json'] = encode(JSON.stringify(manifest, null, 2));
  files['data/scribble.json'] = encode(JSON.stringify(data, null, 2));
  files['README.txt'] = encode(NOTICE);

  for (const pad of pads) {
    files[padMarkdownFileName(pad)] = encode(padToMarkdown(pad, items, ink, exportedAt));
  }

  const stamp = exportedAt.slice(0, 10);
  const fileName = options.padId ? `scribble-pad-${stamp}.zip` : `scribble-export-${stamp}.zip`;

  log.info('export.built', { pads: pads.length, items: items.length, assets: assets.length });
  return { bytes: zipSync(files, { level: 6 }), fileName, manifest };
}

export interface ImportSummary {
  pads: number;
  items: number;
  ink: number;
  assets: number;
  skipped: number;
}

/**
 * Reads a bundle and writes its contents as *new* pads.
 *
 * Imports never overwrite existing material: every identifier is regenerated, so
 * importing the same bundle twice produces two independent copies rather than
 * silently replacing a user's work. Settings inside a bundle are ignored.
 */
export async function importBundle(storage: Storage, bytes: Uint8Array): Promise<ImportSummary> {
  if (bytes.byteLength > MAX_IMPORT_BYTES) {
    throw new Error('That export is too large to import.');
  }

  let archive: Record<string, Uint8Array>;
  try {
    archive = unzipSync(bytes);
  } catch {
    throw new Error('That file is not a Scribble export bundle.');
  }

  const raw = archive['data/scribble.json'];
  if (!raw) throw new Error('That bundle does not contain any Scribble data.');

  let parsed: unknown;
  try {
    parsed = JSON.parse(decode(raw));
  } catch {
    throw new Error('The data inside that bundle could not be read.');
  }

  const result = scribbleExportSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error('That bundle is not a valid Scribble export, so nothing was imported.');
  }

  const manifestRaw = archive['manifest.json'];
  if (manifestRaw) {
    try {
      manifestSchema.parse(JSON.parse(decode(manifestRaw)));
    } catch {
      throw new Error('The bundle manifest is not valid, so nothing was imported.');
    }
  }

  const data = result.data;
  const padIdMap = new Map<string, Uuid>();
  const service = assetService();
  const summary: ImportSummary = { pads: 0, items: 0, ink: 0, assets: 0, skipped: 0 };
  const assetSources = new Map(data.assets.map((asset) => [asset.source, asset.file]));

  for (const pad of data.pads) {
    const created = await storage.pads.create({
      name: pad.name,
      background: pad.background,
      gridType: pad.gridType,
      snapEnabled: pad.snapEnabled,
      zoom: pad.zoom,
      viewportX: pad.viewportX,
      viewportY: pad.viewportY,
      archivedAt: pad.archivedAt,
      deletedAt: pad.deletedAt,
    });
    padIdMap.set(pad.id, created.id);
    summary.pads += 1;
  }

  for (const item of data.items) {
    const padId = padIdMap.get(item.padId);
    if (!padId) {
      summary.skipped += 1;
      continue;
    }

    let content = item.content as Record<string, unknown>;

    // Re-store any bundled image under a fresh local path so the import cannot
    // reference a location outside Scribble's own assets folder.
    if (item.itemType === 'image' && typeof content.source === 'string') {
      const fileName = assetSources.get(content.source);
      const assetBytes = fileName ? archive[`assets/${fileName}`] : undefined;
      if (assetBytes) {
        try {
          const stored = await service.storeImage(
            assetBytes,
            typeof content.mimeType === 'string' ? content.mimeType : 'image/png',
          );
          content = { ...content, source: stored.source, mode: stored.mode };
          summary.assets += 1;
        } catch {
          summary.skipped += 1;
          continue;
        }
      }
    }

    await storage.items.create({
      id: newId(),
      padId,
      itemType: item.itemType,
      content: content as never,
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
      zIndex: item.zIndex,
      colour: item.colour,
      pinned: item.pinned,
    });
    summary.items += 1;
  }

  for (const stroke of data.ink) {
    const padId = padIdMap.get(stroke.padId);
    if (!padId) {
      summary.skipped += 1;
      continue;
    }
    await storage.ink.create({
      id: newId(),
      padId,
      colour: stroke.colour,
      width: stroke.width,
      points: stroke.points,
    });
    summary.ink += 1;
  }

  log.info('import.completed', { pads: summary.pads, items: summary.items });
  return summary;
}

/** Convenience helpers used by tests and by the Settings panel. */
export function readBundleManifest(bytes: Uint8Array): ExportManifest | null {
  try {
    const archive = unzipSync(bytes);
    const manifest = archive['manifest.json'];
    if (!manifest) return null;
    return manifestSchema.parse(JSON.parse(decode(manifest)));
  } catch {
    return null;
  }
}

export type { Pad, Item };
