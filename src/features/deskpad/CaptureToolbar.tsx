import { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  ClipboardPaste,
  FilePlus,
  Pencil,
  Plus,
  Search,
  SquareCheck,
  WandSparkles,
} from 'lucide-react';
import { newId } from '@/lib/ids';
import { screenToPad } from '@/lib/geometry';
import { useDeskStore } from '@/store/deskStore';
import { useUiStore } from '@/store/uiStore';
import { useSettingsStore } from '@/store/settingsStore';
import { DictateButton } from '@/features/dictation/DictateButton';
import { captureFromFileReference } from './capture';
import { isDesktop } from '@/services/platform';
import { validateFileReference } from '@/services/security/validation';
import { describeError } from '@/services/logging/logger';

/**
 * The floating capture toolbar.
 *
 * It collapses to a single button when it is not in use, so the deskpad stays
 * the focus. Every action has a keyboard shortcut as well as a button, and each
 * button carries a visible label in its tooltip and an accessible name.
 */
export function CaptureToolbar() {
  const expanded = useUiStore((state) => state.toolbarExpanded);
  const setExpanded = useUiStore((state) => state.setToolbarExpanded);
  const setTool = useUiStore((state) => state.setTool);
  const tool = useUiStore((state) => state.tool);
  const openPanel = useUiStore((state) => state.openPanel);
  const notify = useUiStore((state) => state.notify);

  const pinned = useSettingsStore((state) => state.settings.toolbarPinned);
  const createItem = useDeskStore((state) => state.createItem);
  const viewport = useDeskStore((state) => state.viewport);
  const selection = useDeskStore((state) => state.selection);

  const [hovering, setHovering] = useState(false);
  const open = expanded || pinned || hovering || tool !== 'select';

  /** A sensible landing spot: near the top-left of what the user can currently see. */
  function dropPoint(): { x: number; y: number } {
    return screenToPad({ x: 160, y: 160 }, viewport);
  }

  async function addFileReference(): Promise<void> {
    if (!isDesktop()) {
      notify(
        'Choosing a file needs the desktop application. You can still drag files onto the pad.',
        'info',
      );
      return;
    }
    try {
      const { open: openDialog } = await import('@tauri-apps/plugin-dialog');
      const selected = await openDialog({ multiple: false, directory: false });
      if (typeof selected !== 'string') return;

      const fileName = selected.split(/[\\/]/).pop() ?? selected;
      const { stat } = await import('@tauri-apps/plugin-fs');
      const info = await stat(selected);

      const validation = validateFileReference(fileName, info.size);
      if (!validation.ok) {
        notify(validation.reason ?? 'That file cannot be referenced.', 'warning');
        return;
      }

      const card = captureFromFileReference(selected, fileName, info.size, '');
      await createItem(card.itemType, card.content, dropPoint(), {
        width: card.width ?? 280,
        height: card.height ?? 170,
        focus: false,
      });
    } catch (error) {
      notify(describeError(error, 'That file could not be added.'), 'error');
    }
  }

  return (
    <div
      className="pointer-events-none absolute bottom-4 left-1/2 z-30 -translate-x-1/2"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <div
        className="sb-panel pointer-events-auto flex w-max max-w-[calc(100vw-1.5rem)] items-center gap-1 overflow-x-auto px-2 py-1.5"
        role="toolbar"
        aria-label="Capture toolbar"
        style={{ borderRadius: 'var(--sb-radius-pill)' }}
      >
        {open ? (
          <>
            <ToolButton
              label="New note"
              hint="N"
              onClick={() => void createItem('text', { kind: 'text', html: '' }, dropPoint())}
            >
              <Plus size={18} />
            </ToolButton>

            <ToolButton
              label="New checklist"
              hint="C"
              onClick={() =>
                void createItem(
                  'checklist',
                  {
                    kind: 'checklist',
                    title: '',
                    entries: [{ id: newId(), text: '', done: false }],
                  },
                  dropPoint(),
                )
              }
            >
              <SquareCheck size={18} />
            </ToolButton>

            <ToolButton
              label="Pen and ink"
              hint="P"
              pressed={tool !== 'select'}
              onClick={() => setTool(tool === 'select' ? 'ink' : 'select')}
            >
              <Pencil size={18} />
            </ToolButton>

            <DictateButton />

            <ToolButton
              label="Paste from clipboard"
              hint="Ctrl + V"
              onClick={() =>
                notify(
                  'Press Ctrl + V to paste. Scribble reads the clipboard only when you ask it to.',
                  'info',
                )
              }
            >
              <ClipboardPaste size={18} />
            </ToolButton>

            <ToolButton
              label="Add a file reference"
              hint="Ctrl + O"
              onClick={() => void addFileReference()}
            >
              <FilePlus size={18} />
            </ToolButton>

            <ToolButton label="Search" hint="Ctrl + F" onClick={() => openPanel('search')}>
              <Search size={18} />
            </ToolButton>

            <ToolButton
              label={
                selection.length > 0
                  ? `Organise ${selection.length} selected ${selection.length === 1 ? 'note' : 'notes'}`
                  : 'Organise'
              }
              hint="Ctrl + G"
              onClick={() => openPanel('organise')}
            >
              <WandSparkles size={18} />
            </ToolButton>

            <span
              className="mx-0.5 h-6 w-px"
              style={{ background: 'var(--sb-border)' }}
              aria-hidden="true"
            />
          </>
        ) : null}

        <button
          type="button"
          className="sb-icon-button"
          aria-expanded={open}
          aria-label={open ? 'Collapse capture toolbar' : 'Expand capture toolbar'}
          title={open ? 'Collapse toolbar' : 'Expand toolbar'}
          onClick={() => setExpanded(!expanded)}
        >
          {open ? (
            <ChevronDown size={18} aria-hidden="true" />
          ) : (
            <ChevronUp size={18} aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  );
}

function ToolButton({
  label,
  hint,
  onClick,
  children,
  pressed,
}: {
  label: string;
  hint: string;
  onClick: () => void;
  children: React.ReactNode;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      className="sb-icon-button"
      aria-label={`${label} (${hint})`}
      title={`${label} · ${hint}`}
      {...(pressed === undefined ? {} : { 'aria-pressed': pressed })}
      onClick={onClick}
    >
      <span aria-hidden="true">{children}</span>
    </button>
  );
}
