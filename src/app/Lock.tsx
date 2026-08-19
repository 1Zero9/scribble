import { useEffect } from 'react';
import { Lock } from 'lucide-react';
import { useSettingsStore } from '@/store/settingsStore';
import { useUiStore } from '@/store/uiStore';
import { useDeskStore } from '@/store/deskStore';

/**
 * Automatic application lock.
 *
 * This is a privacy screen for a shared desk, not a security boundary: it hides
 * what is on screen after a period of inactivity. It deliberately does not claim
 * to protect the database file, which is covered in `docs/THREAT_MODEL.md`.
 */
export function useAutoLock(): void {
  const minutes = useSettingsStore((state) => state.settings.autoLockMinutes);
  const setLocked = useUiStore((state) => state.setLocked);

  useEffect(() => {
    if (minutes <= 0) return;

    let timer: ReturnType<typeof setTimeout>;
    function reset(): void {
      clearTimeout(timer);
      timer = setTimeout(
        () => {
          void useDeskStore.getState().flush();
          setLocked(true);
        },
        minutes * 60 * 1000,
      );
    }

    const events: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'wheel'];
    events.forEach((name) => window.addEventListener(name, reset, { passive: true }));
    reset();

    return () => {
      clearTimeout(timer);
      events.forEach((name) => window.removeEventListener(name, reset));
    };
  }, [minutes, setLocked]);
}

export function LockScreen() {
  const setLocked = useUiStore((state) => state.setLocked);

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4"
      style={{ background: 'var(--sb-deskpad)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Scribble is locked"
    >
      <Lock size={32} aria-hidden="true" style={{ color: 'var(--sb-text-muted)' }} />
      <p className="text-base font-medium">Scribble is locked</p>
      <p className="max-w-sm text-center text-sm" style={{ color: 'var(--sb-text-muted)' }}>
        Your notes are hidden until you continue. This screen keeps your deskpad private on a shared
        desk; it does not encrypt the data on this device.
      </p>
      <button
        type="button"
        className="sb-button sb-button--primary"
        onClick={() => setLocked(false)}
        autoFocus
      >
        Unlock
      </button>
    </div>
  );
}
