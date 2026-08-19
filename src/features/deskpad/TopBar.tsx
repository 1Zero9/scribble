import { useEffect, useRef, useState } from 'react';
import { Inbox, Plus, Search, Settings as SettingsIcon } from 'lucide-react';
import { Wordmark } from '@/components/Wordmark';
import { DeskClock } from './DeskClock';
import { selectActivePad, useDeskStore } from '@/store/deskStore';
import { useUiStore } from '@/store/uiStore';
import { useSettingsStore } from '@/store/settingsStore';
import { padDisplayName } from '@/services/search/search';

/**
 * The top bar.
 *
 * Restrained by design: the pad's identity, four ways out to the rest of the
 * application, and the ambient clock. Naming a pad is optional, so the field
 * shows "Untitled Pad" as a placeholder rather than forcing a title.
 */
export function TopBar() {
  const pad = useDeskStore(selectActivePad);
  const createPad = useDeskStore((state) => state.createPad);
  const renamePad = useDeskStore((state) => state.renamePad);
  const togglePanel = useUiStore((state) => state.togglePanel);
  const panel = useUiStore((state) => state.panel);
  const settings = useSettingsStore((state) => state.settings);

  const [draftName, setDraftName] = useState('');
  const [editingName, setEditingName] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraftName(pad?.name ?? '');
  }, [pad?.id, pad?.name]);

  useEffect(() => {
    if (editingName) inputRef.current?.select();
  }, [editingName]);

  function commitName(): void {
    setEditingName(false);
    if (!pad) return;
    const trimmed = draftName.trim();
    if (trimmed === (pad.name ?? '')) return;
    void renamePad(pad.id, trimmed === '' ? null : trimmed);
  }

  return (
    <header
      className="relative z-20 flex shrink-0 items-center gap-3 px-3"
      style={{
        height: 'var(--sb-topbar-height)',
        background: 'var(--sb-surface)',
        borderBottom: '1px solid var(--sb-border)',
      }}
    >
      <Wordmark />
      <span className="sb-sr-only">Scribble</span>

      <div
        className="mx-1 hidden h-6 w-px sm:block"
        style={{ background: 'var(--sb-border)' }}
        aria-hidden="true"
      />

      <div className="min-w-0 flex-1">
        <label className="sb-sr-only" htmlFor="pad-name">
          Pad name (optional)
        </label>
        <input
          id="pad-name"
          ref={inputRef}
          className="w-full max-w-[22rem] truncate rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-medium hover:border-[var(--sb-border)] focus:border-[var(--sb-border)]"
          value={draftName}
          placeholder={pad ? padDisplayName(pad) : 'Untitled Pad'}
          onChange={(event) => setDraftName(event.target.value)}
          onFocus={() => setEditingName(true)}
          onBlur={commitName}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              event.currentTarget.blur();
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              setDraftName(pad?.name ?? '');
              event.currentTarget.blur();
            }
          }}
          maxLength={120}
        />
      </div>

      <nav className="flex items-center gap-1" aria-label="Scribble">
        <button
          type="button"
          className="sb-button"
          onClick={() => void createPad()}
          title="New pad (Ctrl + Shift + N)"
        >
          <Plus size={16} aria-hidden="true" />
          <span className="hidden md:inline">New pad</span>
        </button>

        <button
          type="button"
          className="sb-icon-button"
          aria-pressed={panel === 'drawer'}
          onClick={() => togglePanel('drawer')}
          title="Pads and Drawer (Ctrl + D)"
        >
          <Inbox size={18} aria-hidden="true" />
          <span className="sb-sr-only">Pads and Drawer</span>
        </button>

        <button
          type="button"
          className="sb-icon-button"
          aria-pressed={panel === 'search'}
          onClick={() => togglePanel('search')}
          title="Search (Ctrl + F)"
        >
          <Search size={18} aria-hidden="true" />
          <span className="sb-sr-only">Search</span>
        </button>

        <button
          type="button"
          className="sb-icon-button"
          aria-pressed={panel === 'settings'}
          onClick={() => togglePanel('settings')}
          title="Settings (Ctrl + ,)"
        >
          <SettingsIcon size={18} aria-hidden="true" />
          <span className="sb-sr-only">Settings</span>
        </button>
      </nav>

      {settings.showClock ? <DeskClock showSeconds={settings.showSeconds} /> : null}
    </header>
  );
}
