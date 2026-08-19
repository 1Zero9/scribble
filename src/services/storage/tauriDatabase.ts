import SqlDatabase from '@tauri-apps/plugin-sql';
import { appDataDir } from '@tauri-apps/api/path';
import type { Database, SqlValue } from './database';
import { toNumberedPlaceholders } from './database';
import { createLogger } from '@/services/logging/logger';

const log = createLogger('storage.tauri');

/** File name of the Scribble database inside the OS application-data folder. */
export const DATABASE_FILE = 'scribble.db';

/**
 * SQLite stored in the operating system's protected application-data location
 * (on Windows: `%APPDATA%\uk.scribble.app\scribble.db`). Scribble never writes
 * user data into the source repository.
 */
export async function createTauriDatabase(): Promise<Database> {
  const handle = await SqlDatabase.load(`sqlite:${DATABASE_FILE}`);
  let location = 'Application data folder';
  try {
    location = `${await appDataDir()}${DATABASE_FILE}`;
  } catch {
    // Path resolution is informational only; failure must not stop start-up.
  }
  log.info('database.opened');

  const adapter: Database = {
    describeLocation: location,

    async execute(sql, params = []) {
      await handle.execute(toNumberedPlaceholders(sql), params as SqlValue[]);
    },

    async select<T>(sql: string, params: readonly SqlValue[] = []) {
      return handle.select<T[]>(toNumberedPlaceholders(sql), params as SqlValue[]);
    },

    /**
     * The Tauri SQL plugin pools connections and does not expose a transaction
     * handle, so statements are run in order on the shared pool rather than
     * inside a single `BEGIN`/`COMMIT`. This is recorded in
     * KNOWN_LIMITATIONS.md; every write Scribble performs is individually
     * idempotent, so a partial failure is recoverable.
     */
    async transaction(work) {
      await work(adapter);
    },

    async close() {
      await handle.close();
    },
  };

  return adapter;
}
