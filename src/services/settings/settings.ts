import { GRID_TYPES, type GridType } from '@/types/domain';
import type { SettingsRepository } from '@/services/storage';

/**
 * Application settings.
 *
 * Settings are stored as key/value strings so the schema never needs migrating
 * when a preference is added. This module owns the only mapping between the
 * typed shape below and those rows.
 */
export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  gridType: GridType;
  snapEnabled: boolean;
  showClock: boolean;
  showSeconds: boolean;
  /** Excluded from every export, as the date and clock are ambient context only. */
  showDateInExports: false;
  globalShortcut: string;
  hideOnEscape: boolean;
  /** Days a deleted item stays in the Drawer before it is purged. */
  retentionDays: number;
  /** Minutes of inactivity before Scribble locks. 0 disables automatic locking. */
  autoLockMinutes: number;
  dictationEnabled: boolean;
  reduceMotion: boolean;
  toolbarPinned: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  gridType: 'dots',
  snapEnabled: true,
  showClock: true,
  showSeconds: false,
  showDateInExports: false,
  globalShortcut: 'CmdOrControl+Shift+Space',
  hideOnEscape: true,
  retentionDays: 30,
  autoLockMinutes: 0,
  dictationEnabled: false,
  reduceMotion: false,
  toolbarPinned: false,
};

export const RETENTION_OPTIONS = [7, 14, 30, 60, 90, 365] as const;
export const AUTO_LOCK_OPTIONS = [0, 1, 5, 15, 30, 60] as const;

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

function parseInt10(
  value: string | undefined,
  fallback: number,
  allowed: readonly number[],
): number {
  const parsed = Number(value);
  return allowed.includes(parsed) ? parsed : fallback;
}

export function decodeSettings(
  records: ReadonlyArray<{ key: string; value: string }>,
): AppSettings {
  const map = new Map(records.map((record) => [record.key, record.value]));
  const theme = map.get('theme');

  return {
    theme:
      theme === 'light' || theme === 'dark' || theme === 'system' ? theme : DEFAULT_SETTINGS.theme,
    gridType: (GRID_TYPES as readonly string[]).includes(map.get('gridType') ?? '')
      ? (map.get('gridType') as GridType)
      : DEFAULT_SETTINGS.gridType,
    snapEnabled: parseBool(map.get('snapEnabled'), DEFAULT_SETTINGS.snapEnabled),
    showClock: parseBool(map.get('showClock'), DEFAULT_SETTINGS.showClock),
    showSeconds: parseBool(map.get('showSeconds'), DEFAULT_SETTINGS.showSeconds),
    showDateInExports: false,
    globalShortcut: map.get('globalShortcut') ?? DEFAULT_SETTINGS.globalShortcut,
    hideOnEscape: parseBool(map.get('hideOnEscape'), DEFAULT_SETTINGS.hideOnEscape),
    retentionDays: parseInt10(
      map.get('retentionDays'),
      DEFAULT_SETTINGS.retentionDays,
      RETENTION_OPTIONS,
    ),
    autoLockMinutes: parseInt10(
      map.get('autoLockMinutes'),
      DEFAULT_SETTINGS.autoLockMinutes,
      AUTO_LOCK_OPTIONS,
    ),
    dictationEnabled: parseBool(map.get('dictationEnabled'), DEFAULT_SETTINGS.dictationEnabled),
    reduceMotion: parseBool(map.get('reduceMotion'), DEFAULT_SETTINGS.reduceMotion),
    toolbarPinned: parseBool(map.get('toolbarPinned'), DEFAULT_SETTINGS.toolbarPinned),
  };
}

export function encodeSettingValue(value: AppSettings[keyof AppSettings]): string {
  return String(value);
}

export async function loadSettings(repository: SettingsRepository): Promise<AppSettings> {
  return decodeSettings(await repository.all());
}

export async function saveSetting<K extends keyof AppSettings>(
  repository: SettingsRepository,
  key: K,
  value: AppSettings[K],
): Promise<void> {
  await repository.set(key, encodeSettingValue(value));
}

/** Key holding the identifier of the pad that was last open. */
export const LAST_PAD_KEY = 'lastPadId';
