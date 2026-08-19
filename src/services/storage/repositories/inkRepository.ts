import type { InkStroke, Uuid } from '@/types/domain';
import { now } from '@/lib/time';
import type { Database } from '../database';
import { toInkStroke, type InkRow } from './mappers';
import type { InkRepository } from './types';

const SELECT = `SELECT id, pad_id, colour, width, points_json, created_at, updated_at, deleted_at
  FROM ink_strokes`;

function inClause(ids: readonly Uuid[]): string {
  return ids.map(() => '?').join(', ');
}

export function createInkRepository(db: Database): InkRepository {
  return {
    async listByPad(padId) {
      const rows = await db.select<InkRow>(
        `${SELECT} WHERE pad_id = ? AND deleted_at IS NULL ORDER BY created_at ASC`,
        [padId],
      );
      return rows.map(toInkStroke);
    },

    async create(stroke) {
      const timestamp = now();
      const record: InkStroke = {
        ...stroke,
        createdAt: stroke.createdAt ?? timestamp,
        updatedAt: stroke.updatedAt ?? timestamp,
        deletedAt: null,
      };
      await db.execute(
        `INSERT INTO ink_strokes (id, pad_id, colour, width, points_json, created_at, updated_at,
          deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          record.id,
          record.padId,
          record.colour,
          record.width,
          JSON.stringify(record.points),
          record.createdAt,
          record.updatedAt,
          null,
        ],
      );
      return record;
    },

    async softDelete(ids) {
      if (ids.length === 0) return;
      await db.execute(
        `UPDATE ink_strokes SET deleted_at = ?, updated_at = ? WHERE id IN (${inClause(ids)})`,
        [now(), now(), ...ids],
      );
    },

    async restore(ids) {
      if (ids.length === 0) return;
      await db.execute(
        `UPDATE ink_strokes SET deleted_at = NULL, updated_at = ? WHERE id IN (${inClause(ids)})`,
        [now(), ...ids],
      );
    },

    async purge(ids) {
      if (ids.length === 0) return;
      await db.execute(`DELETE FROM ink_strokes WHERE id IN (${inClause(ids)})`, [...ids]);
    },

    async purgeDeletedBefore(iso) {
      const rows = await db.select<{ total: number }>(
        'SELECT COUNT(*) AS total FROM ink_strokes WHERE deleted_at IS NOT NULL AND deleted_at < ?',
        [iso],
      );
      await db.execute('DELETE FROM ink_strokes WHERE deleted_at IS NOT NULL AND deleted_at < ?', [
        iso,
      ]);
      return Number(rows[0]?.total ?? 0);
    },

    async count() {
      const rows = await db.select<{ total: number }>('SELECT COUNT(*) AS total FROM ink_strokes');
      return Number(rows[0]?.total ?? 0);
    },
  };
}
