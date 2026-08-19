import { Keyboard } from 'lucide-react';
import { Panel } from '@/components/Panel';
import { useUiStore } from '@/store/uiStore';
import { SHORTCUTS } from './useGlobalKeyboard';

/** A reference for every keyboard route through the application. */
export function ShortcutsPanel() {
  const closePanel = useUiStore((state) => state.closePanel);

  return (
    <Panel
      title="Keyboard shortcuts"
      description="Everything in Scribble can be reached from the keyboard."
      onClose={closePanel}
    >
      <Keyboard
        size={20}
        aria-hidden="true"
        className="mb-3"
        style={{ color: 'var(--sb-text-subtle)' }}
      />
      <dl className="flex flex-col gap-1.5">
        {SHORTCUTS.map((shortcut) => (
          <div key={shortcut.keys} className="flex items-baseline justify-between gap-4">
            <dt className="shrink-0">
              <kbd
                className="rounded px-1.5 py-0.5 text-xs"
                style={{
                  background: 'var(--sb-surface-sunken)',
                  border: '1px solid var(--sb-border)',
                }}
              >
                {shortcut.keys}
              </kbd>
            </dt>
            <dd className="text-right text-sm" style={{ color: 'var(--sb-text-muted)' }}>
              {shortcut.action}
            </dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}
