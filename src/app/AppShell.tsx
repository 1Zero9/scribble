import { useEffect } from 'react';
import { Keyboard, TriangleAlert } from 'lucide-react';
import { ErrorBoundary } from './ErrorBoundary';
import { LiveRegion } from './LiveRegion';
import { Toasts } from './Toasts';
import { LockScreen, useAutoLock } from './Lock';
import { ShortcutsPanel } from './ShortcutsPanel';
import { useGlobalKeyboard } from './useGlobalKeyboard';
import { TopBar } from '@/features/deskpad/TopBar';
import { Deskpad } from '@/features/deskpad/Deskpad';
import { CaptureToolbar } from '@/features/deskpad/CaptureToolbar';
import { DrawerPanel } from '@/features/drawer/DrawerPanel';
import { SearchPanel } from '@/features/search/SearchPanel';
import { OrganisePanel } from '@/features/organiser/OrganisePanel';
import { SettingsPanel } from '@/features/settings/SettingsPanel';
import { useDeskStore } from '@/store/deskStore';
import { useSettingsStore, applyTheme } from '@/store/settingsStore';
import { useUiStore } from '@/store/uiStore';
import { registerSummonShortcut } from '@/services/desktop/windowService';

/**
 * The application shell.
 *
 * It owns start-up ordering (settings, then data), window-level concerns, and
 * which panel is on screen. Everything else lives in a feature area.
 */
export function AppShell() {
  const status = useDeskStore((state) => state.status);
  const error = useDeskStore((state) => state.error);
  const initialise = useDeskStore((state) => state.initialise);
  const flush = useDeskStore((state) => state.flush);

  const loadSettings = useSettingsStore((state) => state.load);
  const settingsLoaded = useSettingsStore((state) => state.loaded);
  const theme = useSettingsStore((state) => state.settings.theme);
  const shortcut = useSettingsStore((state) => state.settings.globalShortcut);

  const panel = useUiStore((state) => state.panel);
  const togglePanel = useUiStore((state) => state.togglePanel);
  const locked = useUiStore((state) => state.locked);

  useGlobalKeyboard();
  useAutoLock();

  // Settings first, so the retention rule and theme are known before data loads.
  useEffect(() => {
    void loadSettings().then(() => initialise());
  }, [initialise, loadSettings]);

  // Follow the operating system when the theme is set to "match Windows".
  useEffect(() => {
    applyTheme(theme);
    if (theme !== 'system') return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = () => applyTheme('system');
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
  }, [theme]);

  useEffect(() => {
    let cancelled = false;
    let unregister: (() => Promise<void>) | null = null;
    void registerSummonShortcut(shortcut).then((fn) => {
      if (cancelled) void fn();
      else unregister = fn;
    });
    return () => {
      cancelled = true;
      void unregister?.();
    };
  }, [shortcut]);

  // Nothing may be lost when the window is hidden or closed.
  useEffect(() => {
    function persist(): void {
      void flush();
    }
    window.addEventListener('blur', persist);
    window.addEventListener('pagehide', persist);
    document.addEventListener('visibilitychange', persist);
    return () => {
      window.removeEventListener('blur', persist);
      window.removeEventListener('pagehide', persist);
      document.removeEventListener('visibilitychange', persist);
    };
  }, [flush]);

  if (status === 'error') {
    return (
      <main className="flex h-full items-center justify-center p-6">
        <div className="sb-panel max-w-md p-5" role="alert">
          <h1 className="flex items-center gap-2 text-base font-semibold">
            <TriangleAlert size={18} aria-hidden="true" style={{ color: 'var(--sb-danger)' }} />
            Scribble could not open your data
          </h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--sb-text-muted)' }}>
            {error ?? 'The local database could not be opened.'} Your existing notes have not been
            changed. Restarting Scribble usually resolves this.
          </p>
          <button
            type="button"
            className="sb-button sb-button--primary mt-4"
            onClick={() => void initialise()}
          >
            Try again
          </button>
        </div>
      </main>
    );
  }

  if (status === 'loading' || !settingsLoaded) {
    return (
      <main className="flex h-full items-center justify-center" aria-busy="true">
        <p className="text-sm" style={{ color: 'var(--sb-text-muted)' }}>
          Opening your deskpad…
        </p>
      </main>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <a
        href="#deskpad-main"
        className="sb-sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-[var(--sb-surface-raised)] focus:px-3 focus:py-2"
      >
        Skip to the deskpad
      </a>

      <ErrorBoundary label="The top bar">
        <TopBar />
      </ErrorBoundary>

      <main id="deskpad-main" className="relative flex min-h-0 flex-1 flex-col">
        <ErrorBoundary label="The deskpad">
          <Deskpad />
        </ErrorBoundary>
        <ErrorBoundary label="The capture toolbar">
          <CaptureToolbar />
        </ErrorBoundary>
      </main>

      <button
        type="button"
        className="sb-icon-button fixed bottom-4 right-4 z-30"
        style={{ background: 'var(--sb-surface)', border: '1px solid var(--sb-border)' }}
        onClick={() => togglePanel('shortcuts')}
        title="Keyboard shortcuts (Ctrl + ?)"
      >
        <Keyboard size={17} aria-hidden="true" />
        <span className="sb-sr-only">Keyboard shortcuts</span>
      </button>

      <ErrorBoundary label="This panel">
        {panel === 'drawer' ? <DrawerPanel /> : null}
        {panel === 'search' ? <SearchPanel /> : null}
        {panel === 'organise' ? <OrganisePanel /> : null}
        {panel === 'settings' ? <SettingsPanel /> : null}
        {panel === 'shortcuts' ? <ShortcutsPanel /> : null}
      </ErrorBoundary>

      <Toasts />
      <LiveRegion />
      {locked ? <LockScreen /> : null}
    </div>
  );
}
