import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js';
// The WebAssembly binary is bundled locally by Vite. Nothing is fetched from a
// content delivery network, so the browser build makes no external requests.
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import type { Database, SqlValue } from './database';
import { idbDelete, idbGet, idbSet } from './idb';
import { createLogger } from '@/services/logging/logger';

const log = createLogger('storage.web');
const IMAGE_KEY = 'scribble.sqlite';

/**
 * SQLite compiled to WebAssembly, persisted to IndexedDB.
 *
 * This adapter exists so the interface can be developed and UI-tested in a
 * browser without a Rust toolchain. It is never used inside the packaged
 * desktop application, where `createTauriDatabase` provides a real file-backed
 * database in the protected application-data folder.
 */
export async function createWebDatabase(): Promise<Database> {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const existing = await idbGet<Uint8Array>(IMAGE_KEY);
  const handle: SqlJsDatabase = existing ? new SQL.Database(existing) : new SQL.Database();
  handle.run('PRAGMA foreign_keys = ON');

  let persistTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  async function persistNow(): Promise<void> {
    if (closed) return;
    await idbSet(IMAGE_KEY, handle.export());
  }

  function schedulePersist(): void {
    if (persistTimer !== null) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      persistTimer = null;
      void persistNow().catch((error: unknown) => {
        log.error('persist.failed');
        throw error;
      });
    }, 250);
  }

  const adapter: Database = {
    describeLocation: 'Browser development storage (IndexedDB)',

    async execute(sql, params = []) {
      handle.run(sql, params as SqlValue[]);
      schedulePersist();
    },

    async select<T>(sql: string, params: readonly SqlValue[] = []) {
      const statement = handle.prepare(sql);
      try {
        statement.bind(params as SqlValue[]);
        const rows: T[] = [];
        while (statement.step()) rows.push(statement.getAsObject() as T);
        return rows;
      } finally {
        statement.free();
      }
    },

    async transaction(work) {
      handle.run('BEGIN');
      try {
        await work(adapter);
        handle.run('COMMIT');
      } catch (error) {
        handle.run('ROLLBACK');
        throw error;
      }
      schedulePersist();
    },

    async close() {
      if (persistTimer !== null) clearTimeout(persistTimer);
      await persistNow();
      closed = true;
      handle.close();
    },
  };

  // Flush before the page goes away so nothing is lost on reload.
  window.addEventListener('pagehide', () => {
    if (!closed) void idbSet(IMAGE_KEY, handle.export());
  });

  log.info('database.opened');
  return adapter;
}

/** Used by "Delete all application data" in the browser build. */
export async function destroyWebDatabase(): Promise<void> {
  await idbDelete(IMAGE_KEY);
}
