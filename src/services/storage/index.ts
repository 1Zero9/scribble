import { isDesktop } from '@/services/platform';
import { createLogger } from '@/services/logging/logger';
import type { Database } from './database';
import { runMigrations } from './runMigrations';
import { createPadRepository } from './repositories/padRepository';
import { createItemRepository } from './repositories/itemRepository';
import { createInkRepository } from './repositories/inkRepository';
import { createSettingsRepository } from './repositories/settingsRepository';
import type {
  InkRepository,
  ItemRepository,
  PadRepository,
  SettingsRepository,
} from './repositories/types';

const log = createLogger('storage');

/**
 * The single object the rest of the application uses to reach persistence.
 * `db` is exposed only for export/import and maintenance tasks.
 */
export interface Storage {
  pads: PadRepository;
  items: ItemRepository;
  ink: InkRepository;
  settings: SettingsRepository;
  db: Database;
  location: string;
}

export function createStorageFrom(db: Database): Storage {
  return {
    pads: createPadRepository(db),
    items: createItemRepository(db),
    ink: createInkRepository(db),
    settings: createSettingsRepository(db),
    db,
    location: db.describeLocation,
  };
}

let cached: Promise<Storage> | null = null;

/** Opens (or reuses) the local database and brings the schema up to date. */
export function openStorage(): Promise<Storage> {
  cached ??= (async () => {
    const db = isDesktop()
      ? await (await import('./tauriDatabase')).createTauriDatabase()
      : await (await import('./webDatabase')).createWebDatabase();

    const applied = await runMigrations(db);
    log.info('storage.ready', { migrationsApplied: applied, desktop: isDesktop() });
    return createStorageFrom(db);
  })();
  return cached;
}

/** Removes every row from the local database. Used by "Delete all data". */
export async function eraseAllData(storage: Storage): Promise<void> {
  await storage.db.execute('DELETE FROM ink_strokes');
  await storage.db.execute('DELETE FROM items');
  await storage.db.execute('DELETE FROM pads');
  await storage.db.execute('DELETE FROM settings');
  log.warn('storage.erased');
}

export type { Database } from './database';
export type * from './repositories/types';
