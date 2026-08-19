import { now } from '@/lib/time';
import type { Database } from '../database';
import type { SettingsRepository } from './types';

interface SettingRow {
  key: string;
  value: string;
  updated_at: string;
}

export function createSettingsRepository(db: Database): SettingsRepository {
  return {
    async all() {
      const rows = await db.select<SettingRow>('SELECT key, value, updated_at FROM settings');
      return rows.map((row) => ({ key: row.key, value: row.value, updatedAt: row.updated_at }));
    },

    async get(key) {
      const rows = await db.select<SettingRow>(
        'SELECT key, value, updated_at FROM settings WHERE key = ?',
        [key],
      );
      return rows[0]?.value ?? null;
    },

    async set(key, value) {
      await db.execute(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [key, value, now()],
      );
    },

    async remove(key) {
      await db.execute('DELETE FROM settings WHERE key = ?', [key]);
    },
  };
}
