import { CircleAlert, Info, ShieldCheck, TriangleAlert, X } from 'lucide-react';
import { useUiStore, type ToastTone } from '@/store/uiStore';

const TONE_ICON: Record<ToastTone, typeof Info> = {
  info: Info,
  success: ShieldCheck,
  warning: TriangleAlert,
  error: CircleAlert,
};

const TONE_COLOUR: Record<ToastTone, string> = {
  info: 'var(--sb-text-muted)',
  success: 'var(--sb-success)',
  warning: 'var(--sb-warning)',
  error: 'var(--sb-danger)',
};

/** Transient messages. Each carries an icon and words, never colour alone. */
export function Toasts() {
  const toasts = useUiStore((state) => state.toasts);
  const dismiss = useUiStore((state) => state.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-24 left-1/2 z-50 flex w-full max-w-md -translate-x-1/2 flex-col gap-2 px-4"
      role="status"
    >
      {toasts.map((toast) => {
        const Icon = TONE_ICON[toast.tone];
        return (
          <div
            key={toast.id}
            className="sb-panel pointer-events-auto flex items-center gap-3 px-3 py-2 text-sm"
          >
            <Icon size={16} aria-hidden="true" style={{ color: TONE_COLOUR[toast.tone] }} />
            <span className="min-w-0 flex-1">{toast.message}</span>
            {toast.action ? (
              <button
                type="button"
                className="sb-button sb-button--quiet"
                onClick={() => {
                  toast.action?.run();
                  dismiss(toast.id);
                }}
              >
                {toast.action.label}
              </button>
            ) : null}
            <button
              type="button"
              className="sb-icon-button"
              style={{ width: 32, height: 32 }}
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss message"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
