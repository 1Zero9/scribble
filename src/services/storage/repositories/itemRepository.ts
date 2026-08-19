import type { Item, Uuid } from '@/types/domain';
import { now } from '@/lib/time';
import { toSqlBool, type Database, type SqlValue } from '../database';
import { toItem, type ItemRow } from './mappers';
import type { ItemPatch, ItemRepository, NewItem } from './types';

const SELECT = `SELECT id, pad_id, item_type, content, position_x, position_y, width, height,
  z_index, colour, pinned, created_at, updated_at, archived_at, deleted_at FROM items`;

const COLUMNS: Record<keyof ItemPatch, string> = {
  itemType: 'item_type',
  content: 'content',
  x: 'position_x',
  y: 'position_y',
  width: 'width',
  height: 'height',
  zIndex: 'z_index',
  colour: 'colour',
  pinned: 'pinned',
  updatedAt: 'updated_at',
  archivedAt: 'archived_at',
  deletedAt: 'deleted_at',
};

/** Builds a `WHERE id IN (?, ?, …)` fragment for a list of identifiers. */
function inClause(ids: readonly Uuid[]): string {
  return ids.map(() => '?').join(', ');
}

export function createItemRepository(db: Database): ItemRepository {
  function buildUpdate(patch: ItemPatch): { assignments: string[]; params: SqlValue[] } {
    const assignments: string[] = [];
    const params: SqlValue[] = [];

    for (const [key, column] of Object.entries(COLUMNS) as [keyof ItemPatch, string][]) {
      if (!(key in patch)) continue;
      const value = patch[key];
      assignments.push(`${column} = ?`);
      if (key === 'content') {
        params.push(JSON.stringify(value));
      } else if (typeof value === 'boolean') {
        params.push(toSqlBool(value));
      } else {
        params.push((value as SqlValue) ?? null);
      }
    }

    if (!('updatedAt' in patch)) {
      assignments.push('updated_at = ?');
      params.push(now());
    }
    return { assignments, params };
  }

  async function insert(item: NewItem): Promise<Item> {
    const timestamp = now();
    const record: Item = {
      ...item,
      createdAt: item.createdAt ?? timestamp,
      updatedAt: item.updatedAt ?? timestamp,
      archivedAt: null,
      deletedAt: null,
    };

    await db.execute(
      `INSERT INTO items (id, pad_id, item_type, content, position_x, position_y, width, height,
        z_index, colour, pinned, created_at, updated_at, archived_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.id,
        record.padId,
        record.itemType,
        JSON.stringify(record.content),
        record.x,
        record.y,
        record.width,
        record.height,
        record.zIndex,
        record.colour,
        toSqlBool(record.pinned),
        record.createdAt,
        record.updatedAt,
        null,
        null,
      ],
    );

    return record;
  }

  async function setTimestampColumn(
    column: 'archived_at' | 'deleted_at',
    ids: readonly Uuid[],
    value: string | null,
  ): Promise<void> {
    if (ids.length === 0) return;
    await db.execute(
      `UPDATE items SET ${column} = ?, updated_at = ? WHERE id IN (${inClause(ids)})`,
      [value, now(), ...ids],
    );
  }

  return {
    async listByPad(padId, options = {}) {
      const clauses = ['pad_id = ?', 'deleted_at IS NULL'];
      if (!options.includeArchived) clauses.push('archived_at IS NULL');
      const rows = await db.select<ItemRow>(
        `${SELECT} WHERE ${clauses.join(' AND ')} ORDER BY z_index ASC, created_at ASC`,
        [padId],
      );
      return rows.map(toItem);
    },

    async listAll(options = {}) {
      const clauses: string[] = [];
      if (!options.includeDeleted) clauses.push('deleted_at IS NULL');
      if (!options.includeArchived) clauses.push('archived_at IS NULL');
      const where = clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '';
      const limit = options.limit ?? 2000;
      const rows = await db.select<ItemRow>(`${SELECT}${where} ORDER BY updated_at DESC LIMIT ?`, [
        limit,
      ]);
      return rows.map(toItem);
    },

    async listDeleted(limit = 300) {
      const rows = await db.select<ItemRow>(
        `${SELECT} WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT ?`,
        [limit],
      );
      return rows.map(toItem);
    },

    async listArchived(limit = 300) {
      const rows = await db.select<ItemRow>(
        `${SELECT} WHERE archived_at IS NOT NULL AND deleted_at IS NULL
         ORDER BY archived_at DESC LIMIT ?`,
        [limit],
      );
      return rows.map(toItem);
    },

    async get(id) {
      const rows = await db.select<ItemRow>(`${SELECT} WHERE id = ?`, [id]);
      const row = rows[0];
      return row ? toItem(row) : null;
    },

    create: insert,

    async createMany(items) {
      const created: Item[] = [];
      await db.transaction(async () => {
        for (const item of items) created.push(await insert(item));
      });
      return created;
    },

    async update(id, patch) {
      const { assignments, params } = buildUpdate(patch);
      if (assignments.length === 0) return;
      await db.execute(`UPDATE items SET ${assignments.join(', ')} WHERE id = ?`, [...params, id]);
    },

    async updateMany(patches) {
      if (patches.length === 0) return;
      await db.transaction(async (tx) => {
        for (const { id, patch } of patches) {
          const { assignments, params } = buildUpdate(patch);
          if (assignments.length === 0) continue;
          await tx.execute(`UPDATE items SET ${assignments.join(', ')} WHERE id = ?`, [
            ...params,
            id,
          ]);
        }
      });
    },

    async archive(ids) {
      await setTimestampColumn('archived_at', ids, now());
    },

    async softDelete(ids) {
      await setTimestampColumn('deleted_at', ids, now());
    },

    async restore(ids) {
      if (ids.length === 0) return;
      await db.execute(
        `UPDATE items SET deleted_at = NULL, archived_at = NULL, updated_at = ?
         WHERE id IN (${inClause(ids)})`,
        [now(), ...ids],
      );
    },

    async purge(ids) {
      if (ids.length === 0) return;
      await db.execute(`DELETE FROM items WHERE id IN (${inClause(ids)})`, [...ids]);
    },

    async purgeDeletedBefore(iso) {
      const rows = await db.select<{ total: number }>(
        'SELECT COUNT(*) AS total FROM items WHERE deleted_at IS NOT NULL AND deleted_at < ?',
        [iso],
      );
      await db.execute('DELETE FROM items WHERE deleted_at IS NOT NULL AND deleted_at < ?', [iso]);
      return Number(rows[0]?.total ?? 0);
    },

    async maxZIndex(padId) {
      const rows = await db.select<{ value: number | null }>(
        'SELECT MAX(z_index) AS value FROM items WHERE pad_id = ?',
        [padId],
      );
      return Number(rows[0]?.value ?? 0);
    },

    async count() {
      const rows = await db.select<{ total: number }>('SELECT COUNT(*) AS total FROM items');
      return Number(rows[0]?.total ?? 0);
    },
  };
}
