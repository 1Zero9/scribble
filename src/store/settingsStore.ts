import { create } from 'zustand';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSetting,
  type AppSettings,
} from '@/services/settings/settings';
import { openStorage } from '@/services/storage';
import { createLogger } from '@/services/logging/logger';

const log = createLogger('settings');

interface SettingsState {
  settings: AppSettings;
  loaded: boolean;
  load: () => Promise<void>;
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,

  async load() {
    const storage = await openStorage();
    const settings = await loadSettings(storage.settings);
    set({ settings, loaded: true });
    applyTheme(settings.theme);
  },

  async update(key, value) {
    set({ settings: { ...get().settings, [key]: value } });
    if (key === 'theme') applyTheme(value as AppSettings['theme']);
    try {
      const storage = await openStorage();
      await saveSetting(storage.settings, key, value);
    } catch {
      log.error('setting.save.failed');
    }
  },
}));

/** Applies the chosen theme to the document root, following the OS when asked to. */
export function applyTheme(theme: AppSettings['theme']): void {
  if (typeof document === 'undefined') return;
  const resolved =
    theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : theme;
  document.documentElement.dataset.theme = resolved;
}
