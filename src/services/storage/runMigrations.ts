import { createLogger } from '@/services/logging/logger';
import type { Database } from './database';
import { MIGRATIONS } from './migrations';

const log = createLogger('storage');

interface AppliedRow {
  id: number;
}

/**
 * Applies any migrations that have not yet run.
 *
 * Each migration runs inside a transaction and records itself in
 * `schema_migrations`, so an interrupted upgrade cannot leave a half-applied
 * schema behind.
 */
export async function runMigrations(db: Database): Promise<number> {
  await db.execute(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      id         INTEGER PRIMARY KEY NOT NULL,
      name       TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )`,
  );

  const applied = await db.select<AppliedRow>('SELECT id FROM schema_migrations');
  const appliedIds = new Set(applied.map((row) => Number(row.id)));

  let count = 0;
  for (const migration of MIGRATIONS) {
    if (appliedIds.has(migration.id)) continue;
    await db.transaction(async (tx) => {
      for (const statement of migration.statements) {
        await tx.execute(statement);
      }
      await tx.execute('INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)', [
        migration.id,
        migration.name,
        new Date().toISOString(),
      ]);
    });
    count += 1;
    log.info('migration.applied', { id: migration.id });
  }

  return count;
}
