import { useEffect, useId, useRef } from 'react';
import { TriangleAlert } from 'lucide-react';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
}

/** A blocking confirmation, used only for actions that cannot be undone. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();
  const messageId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'var(--sb-overlay-scrim)' }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        className="sb-panel w-full max-w-md p-5"
      >
        <div className="flex gap-3">
          {tone === 'danger' ? (
            <TriangleAlert size={20} aria-hidden="true" style={{ color: 'var(--sb-danger)' }} />
          ) : null}
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold">
              {title}
            </h2>
            <p id={messageId} className="mt-2 text-sm" style={{ color: 'var(--sb-text-muted)' }}>
              {message}
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button ref={cancelRef} type="button" className="sb-button" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={
              tone === 'danger' ? 'sb-button sb-button--danger' : 'sb-button sb-button--primary'
            }
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
