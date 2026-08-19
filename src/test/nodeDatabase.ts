import { DatabaseSync } from 'node:sqlite';
import type { Database, SqlValue } from '@/services/storage/database';
import { createStorageFrom, type Storage } from '@/services/storage';
import { runMigrations } from '@/services/storage/runMigrations';

/**
 * A real SQLite database for unit tests, using Node's built-in `node:sqlite`.
 *
 * Tests therefore exercise the same SQL, the same migrations and the same
 * mappers that ship in the desktop application, rather than a stubbed store.
 */
export function createNodeDatabase(): Database {
  const handle = new DatabaseSync(':memory:');
  handle.exec('PRAGMA foreign_keys = ON');

  const adapter: Database = {
    describeLocation: 'In-memory test database',

    async execute(sql, params = []) {
      handle.prepare(sql).run(...(params as SqlValue[]));
    },

    async select<T>(sql: string, params: readonly SqlValue[] = []) {
      return handle.prepare(sql).all(...(params as SqlValue[])) as T[];
    },

    async transaction(work) {
      handle.exec('BEGIN');
      try {
        await work(adapter);
        handle.exec('COMMIT');
      } catch (error) {
        handle.exec('ROLLBACK');
        throw error;
      }
    },

    async close() {
      handle.close();
    },
  };

  return adapter;
}

export async function createTestStorage(): Promise<Storage> {
  const db = createNodeDatabase();
  await runMigrations(db);
  return createStorageFrom(db);
}
