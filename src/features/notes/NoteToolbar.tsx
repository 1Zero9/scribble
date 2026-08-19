import { useState } from 'react';
import {
  Baseline,
  Bold,
  Copy,
  Heading1,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Palette,
  Pin,
  PinOff,
  SquareCheck,
  Tag,
  Trash2,
} from 'lucide-react';
import { NOTE_COLOURS, NOTE_COLOUR_LABELS, type Item, type NoteColour } from '@/types/domain';
import { isSafeHref } from '@/services/security/sanitise';
import { noteBackground } from './noteStyles';
import { useUiStore } from '@/store/uiStore';

interface NoteToolbarProps {
  item: Item;
  editing: boolean;
  onFormat: (command: string, value?: string) => void;
  onColour: (colour: NoteColour) => void;
  onPin: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onProject: (project: string | null) => void;
}

/**
 * The per-note toolbar.
 *
 * Formatting commands are only offered for text notes, where they apply. Every
 * control is a real button with an accessible name, so the whole toolbar is
 * reachable by keyboard.
 */
export function NoteToolbar({
  item,
  editing,
  onFormat,
  onColour,
  onPin,
  onDuplicate,
  onDelete,
  onProject,
}: NoteToolbarProps) {
  const notify = useUiStore((state) => state.notify);
  const richText = item.itemType === 'text';
  const [draftProject, setDraftProject] = useState(item.project ?? '');

  function addLink(): void {
    const url = window.prompt('Web address for this link:');
    if (url === null) return;
    if (!isSafeHref(url)) {
      notify('Only http, https and mailto addresses can be linked.', 'warning');
      return;
    }
    onFormat('createLink', url);
  }

  return (
    <div
      className="absolute -top-11 left-0 z-10 flex items-center gap-0.5 rounded-[var(--sb-radius-control)] px-1 py-1"
      style={{
        background: 'var(--sb-surface-raised)',
        border: '1px solid var(--sb-border)',
        boxShadow: 'var(--sb-shadow-float)',
      }}
      role="toolbar"
      aria-label="Note actions"
      onPointerDown={(event) => event.stopPropagation()}
    >
      {richText && editing ? (
        <>
          <ToolbarButton label="Bold" onClick={() => onFormat('bold')}>
            <Bold size={15} />
          </ToolbarButton>
          <ToolbarButton label="Italic" onClick={() => onFormat('italic')}>
            <Italic size={15} />
          </ToolbarButton>
          <ToolbarButton label="Heading" onClick={() => onFormat('formatBlock', 'h2')}>
            <Heading1 size={15} />
          </ToolbarButton>
          <ToolbarButton label="Plain paragraph" onClick={() => onFormat('formatBlock', 'p')}>
            <Baseline size={15} />
          </ToolbarButton>
          <ToolbarButton label="Bulleted list" onClick={() => onFormat('insertUnorderedList')}>
            <List size={15} />
          </ToolbarButton>
          <ToolbarButton label="Numbered list" onClick={() => onFormat('insertOrderedList')}>
            <ListOrdered size={15} />
          </ToolbarButton>
          <ToolbarButton label="Add link" onClick={addLink}>
            <LinkIcon size={15} />
          </ToolbarButton>
          <Divider />
        </>
      ) : null}

      <details className="relative">
        <summary
          className="sb-icon-button list-none"
          style={{ width: 32, height: 32 }}
          aria-label="Note colour"
          title="Note colour"
        >
          <Palette size={15} aria-hidden="true" />
        </summary>
        <div
          className="absolute left-0 top-9 z-20 flex w-40 flex-wrap gap-1 rounded-[var(--sb-radius-control)] p-2"
          style={{
            background: 'var(--sb-surface-raised)',
            border: '1px solid var(--sb-border)',
            boxShadow: 'var(--sb-shadow-float)',
          }}
        >
          {NOTE_COLOURS.map((colour) => (
            <button
              key={colour}
              type="button"
              className="h-7 w-7 rounded"
              style={{
                background: noteBackground(colour),
                border:
                  item.colour === colour
                    ? '2px solid var(--sb-accent)'
                    : '1px solid var(--sb-border)',
              }}
              aria-label={NOTE_COLOUR_LABELS[colour]}
              aria-pressed={item.colour === colour}
              title={NOTE_COLOUR_LABELS[colour]}
              onClick={() => onColour(colour)}
            />
          ))}
        </div>
      </details>

      <details className="relative">
        <summary
          className="sb-icon-button list-none"
          style={{ width: 32, height: 32 }}
          aria-label="Project"
          title={item.project ? `Project: ${item.project}` : 'Add to a project'}
        >
          <Tag size={15} aria-hidden="true" />
        </summary>
        <form
          className="absolute left-0 top-9 z-20 flex w-48 flex-col gap-2 rounded-[var(--sb-radius-control)] p-2"
          style={{
            background: 'var(--sb-surface-raised)',
            border: '1px solid var(--sb-border)',
            boxShadow: 'var(--sb-shadow-float)',
          }}
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = draftProject.trim();
            onProject(trimmed === '' ? null : trimmed);
          }}
        >
          <label className="sb-sr-only" htmlFor={`project-${item.id}`}>
            Project
          </label>
          <input
            id={`project-${item.id}`}
            className="sb-input text-xs"
            placeholder="e.g. Operation Falcon"
            value={draftProject}
            onChange={(event) => setDraftProject(event.target.value)}
            maxLength={80}
          />
          <div className="flex items-center gap-1.5">
            <button type="submit" className="sb-button sb-button--primary flex-1 text-xs">
              Save
            </button>
            {item.project ? (
              <button
                type="button"
                className="sb-button text-xs"
                onClick={() => {
                  setDraftProject('');
                  onProject(null);
                }}
              >
                Clear
              </button>
            ) : null}
          </div>
        </form>
      </details>

      <ToolbarButton
        label={item.pinned ? 'Unpin note' : 'Pin note'}
        onClick={onPin}
        pressed={item.pinned}
      >
        {item.pinned ? <PinOff size={15} /> : <Pin size={15} />}
      </ToolbarButton>
      <ToolbarButton label="Duplicate note" onClick={onDuplicate}>
        <Copy size={15} />
      </ToolbarButton>
      <ToolbarButton label="Delete note" onClick={onDelete} danger>
        <Trash2 size={15} />
      </ToolbarButton>
    </div>
  );
}

function Divider() {
  return (
    <span
      className="mx-0.5 h-5 w-px"
      style={{ background: 'var(--sb-border)' }}
      aria-hidden="true"
    />
  );
}

function ToolbarButton({
  label,
  onClick,
  children,
  pressed,
  danger,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  pressed?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className="sb-icon-button"
      style={{ width: 32, height: 32, ...(danger ? { color: 'var(--sb-danger)' } : {}) }}
      aria-label={label}
      title={label}
      {...(pressed === undefined ? {} : { 'aria-pressed': pressed })}
      // `mousedown` would clear the text selection before the command runs.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      <span aria-hidden="true">{children}</span>
    </button>
  );
}

export { SquareCheck };
