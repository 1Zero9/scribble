import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface PanelProps {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** `dialog` traps focus; `complementary` is used for the non-modal Drawer. */
  width?: 'narrow' | 'wide';
}

/**
 * A side panel used by the Drawer, Search, Organise and Settings.
 *
 * It is a modal dialog: focus moves in on open, is trapped while open, and
 * returns to the trigger on close, which keeps the whole application operable
 * from the keyboard alone.
 */
export function Panel({
  title,
  description,
  onClose,
  children,
  footer,
  width = 'narrow',
}: PanelProps) {
  const titleId = useId();
  const descriptionId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<Element | null>(null);

  useEffect(() => {
    previouslyFocused.current = document.activeElement;
    const container = containerRef.current;
    const firstFocusable = container?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    firstFocusable?.focus();

    return () => {
      if (previouslyFocused.current instanceof HTMLElement) previouslyFocused.current.focus();
    };
  }, []);

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = Array.from(
      containerRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    ).filter((element) => element.offsetParent !== null);

    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end"
      style={{ background: 'var(--sb-overlay-scrim)' }}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        onKeyDown={handleKeyDown}
        className="flex h-full flex-col shadow-float"
        style={{
          width: width === 'wide' ? 'min(760px, 100vw)' : 'min(460px, 100vw)',
          background: 'var(--sb-surface)',
          borderLeft: '1px solid var(--sb-border)',
        }}
      >
        <header
          className="flex items-start gap-3 px-4 py-3"
          style={{ borderBottom: '1px solid var(--sb-border)' }}
        >
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base font-semibold">
              {title}
            </h2>
            {description ? (
              <p
                id={descriptionId}
                className="mt-0.5 text-xs"
                style={{ color: 'var(--sb-text-muted)' }}
              >
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="sb-icon-button"
            onClick={onClose}
            aria-label={`Close ${title}`}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-3">{children}</div>

        {footer ? (
          <footer className="px-4 py-3" style={{ borderTop: '1px solid var(--sb-border)' }}>
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}
