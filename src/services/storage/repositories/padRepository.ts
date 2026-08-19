import type { Pad, Uuid } from '@/types/domain';
import { newId } from '@/lib/ids';
import { now } from '@/lib/time';
import { toSqlBool, type Database, type SqlValue } from '../database';
import { toPad, type PadRow } from './mappers';
import type { PadPatch, PadRepository } from './types';

const SELECT = `SELECT id, name, background, grid_type, snap_enabled, zoom, viewport_x,
  viewport_y, created_at, updated_at, archived_at, deleted_at FROM pads`;

/** Maps domain field names onto columns for partial updates. */
const COLUMNS: Record<keyof PadPatch, string> = {
  name: 'name',
  background: 'background',
  gridType: 'grid_type',
  snapEnabled: 'snap_enabled',
  zoom: 'zoom',
  viewportX: 'viewport_x',
  viewportY: 'viewport_y',
  updatedAt: 'updated_at',
  archivedAt: 'archived_at',
  deletedAt: 'deleted_at',
};

export function createPadRepository(db: Database): PadRepository {
  async function applyPatch(id: Uuid, patch: PadPatch): Promise<void> {
    const assignments: string[] = [];
    const params: SqlValue[] = [];

    for (const [key, column] of Object.entries(COLUMNS) as [keyof PadPatch, string][]) {
      if (!(key in patch)) continue;
      const value = patch[key];
      assignments.push(`${column} = ?`);
      params.push(typeof value === 'boolean' ? toSqlBool(value) : (value ?? null));
    }

    if (!('updatedAt' in patch)) {
      assignments.push('updated_at = ?');
      params.push(now());
    }
    if (assignments.length === 0) return;

    params.push(id);
    await db.execute(`UPDATE pads SET ${assignments.join(', ')} WHERE id = ?`, params);
  }

  return {
    async list(options = {}) {
      const clauses: string[] = [];
      if (!options.includeDeleted) clauses.push('deleted_at IS NULL');
      if (!options.includeArchived) clauses.push('archived_at IS NULL');
      const where = clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '';
      const rows = await db.select<PadRow>(`${SELECT}${where} ORDER BY updated_at DESC`);
      return rows.map(toPad);
    },

    async get(id) {
      const rows = await db.select<PadRow>(`${SELECT} WHERE id = ?`, [id]);
      const row = rows[0];
      return row ? toPad(row) : null;
    },

    async create(pad) {
      const timestamp = now();
      const record: Pad = {
        id: pad.id ?? newId(),
        name: pad.name ?? null,
        background: pad.background ?? 'paper',
        gridType: pad.gridType ?? 'dots',
        snapEnabled: pad.snapEnabled ?? true,
        zoom: pad.zoom ?? 1,
        viewportX: pad.viewportX ?? 0,
        viewportY: pad.viewportY ?? 0,
        createdAt: timestamp,
        updatedAt: timestamp,
        archivedAt: pad.archivedAt ?? null,
        deletedAt: pad.deletedAt ?? null,
      };

      await db.execute(
        `INSERT INTO pads (id, name, background, grid_type, snap_enabled, zoom, viewport_x,
          viewport_y, created_at, updated_at, archived_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          record.id,
          record.name,
          record.background,
          record.gridType,
          toSqlBool(record.snapEnabled),
          record.zoom,
          record.viewportX,
          record.viewportY,
          record.createdAt,
          record.updatedAt,
          record.archivedAt,
          record.deletedAt,
        ],
      );

      return record;
    },

    update: applyPatch,

    async archive(id) {
      await applyPatch(id, { archivedAt: now() });
    },

    async softDelete(id) {
      await applyPatch(id, { deletedAt: now() });
    },

    async restore(id) {
      await applyPatch(id, { deletedAt: null, archivedAt: null });
    },

    async purge(id) {
      await db.transaction(async (tx) => {
        await tx.execute('DELETE FROM ink_strokes WHERE pad_id = ?', [id]);
        await tx.execute('DELETE FROM items WHERE pad_id = ?', [id]);
        await tx.execute('DELETE FROM pads WHERE id = ?', [id]);
      });
    },

    async purgeDeletedBefore(iso) {
      const rows = await db.select<{ id: string }>(
        'SELECT id FROM pads WHERE deleted_at IS NOT NULL AND deleted_at < ?',
        [iso],
      );
      for (const row of rows) {
        await db.execute('DELETE FROM ink_strokes WHERE pad_id = ?', [row.id]);
        await db.execute('DELETE FROM items WHERE pad_id = ?', [row.id]);
        await db.execute('DELETE FROM pads WHERE id = ?', [row.id]);
      }
      return rows.length;
    },

    async count() {
      const rows = await db.select<{ total: number }>('SELECT COUNT(*) AS total FROM pads');
      return Number(rows[0]?.total ?? 0);
    },
  };
}
