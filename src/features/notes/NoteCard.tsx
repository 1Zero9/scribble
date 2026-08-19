import { memo, useCallback } from 'react';
import { Pin } from 'lucide-react';
import {
  GRID_SIZE,
  ITEM_TYPE_LABELS,
  NOTE_COLOUR_LABELS,
  type Item,
  type ItemContent,
  type NoteColour,
} from '@/types/domain';
import { formatRelative } from '@/lib/time';
import { itemPreview } from '@/lib/itemText';
import { RichTextEditor } from './RichTextEditor';
import { ChecklistBody } from './ChecklistBody';
import { FileCardBody, ImageCardBody, LinkCardBody } from './CardBodies';
import { NoteToolbar } from './NoteToolbar';
import {
  HANDLE_CURSORS,
  HANDLE_LABELS,
  HANDLE_POSITION,
  RESIZE_HANDLES,
  noteBackground,
  type ResizeHandle,
} from './noteStyles';

export interface NoteCardProps {
  item: Item;
  selected: boolean;
  editing: boolean;
  snapEnabled: boolean;
  onSelect: (event: React.PointerEvent) => void;
  onBeginDrag: (event: React.PointerEvent) => void;
  onBeginResize: (handle: ResizeHandle, event: React.PointerEvent) => void;
  onEdit: () => void;
  onFinishEdit: () => void;
  onContentChange: (content: ItemContent) => void;
  onColour: (colour: NoteColour) => void;
  onPin: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onNudge: (dx: number, dy: number) => void;
  onResizeBy: (dw: number, dh: number) => void;
  onProject: (project: string | null) => void;
  /** Set when this card represents a collapsed stack of two or more notes. */
  bundleCount?: number;
  onExpand?: () => void;
}

/**
 * A single card on the deskpad.
 *
 * The card is a focusable group. Pointer users drag it by its header or body;
 * keyboard users move it with the arrow keys and resize it with Shift + arrow
 * keys, which is the keyboard alternative required for drag-and-resize.
 */
export const NoteCard = memo(function NoteCard({
  item,
  selected,
  editing,
  onSelect,
  onBeginDrag,
  onBeginResize,
  onEdit,
  onFinishEdit,
  onContentChange,
  onColour,
  onPin,
  onDuplicate,
  onDelete,
  onNudge,
  onResizeBy,
  onProject,
  bundleCount = 1,
  onExpand,
}: NoteCardProps) {
  const isBundle = bundleCount > 1;

  const format = useCallback((command: string, value?: string) => {
    document.execCommand(command, false, value);
  }, []);

  function handleKeyDown(event: React.KeyboardEvent<HTMLElement>): void {
    if (editing) return;

    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      if (isBundle) onExpand?.();
      else onEdit();
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      onDelete();
      return;
    }

    const step = event.altKey ? 1 : GRID_SIZE;
    const directions: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const delta = directions[event.key];
    if (!delta) return;

    event.preventDefault();
    if (event.shiftKey) onResizeBy(delta[0], delta[1]);
    else onNudge(delta[0], delta[1]);
  }

  const accessibleName = isBundle
    ? `Stack of ${bundleCount} notes: ${itemPreview(item, 60)}`
    : `${ITEM_TYPE_LABELS[item.itemType]}: ${itemPreview(item, 60)}`;

  return (
    <>
      {isBundle ? (
        <>
          <div
            aria-hidden="true"
            className="absolute rounded-[var(--sb-radius-card)]"
            style={{
              left: item.x + 10,
              top: item.y + 10,
              width: item.width,
              height: item.height,
              zIndex: item.zIndex - 2,
              background: noteBackground(item.colour),
              border: '1px solid var(--sb-border)',
              opacity: 0.5,
            }}
          />
          <div
            aria-hidden="true"
            className="absolute rounded-[var(--sb-radius-card)]"
            style={{
              left: item.x + 5,
              top: item.y + 5,
              width: item.width,
              height: item.height,
              zIndex: item.zIndex - 1,
              background: noteBackground(item.colour),
              border: '1px solid var(--sb-border)',
              opacity: 0.75,
            }}
          />
        </>
      ) : null}

      <article
        data-testid="note-card"
        data-item-id={item.id}
        aria-label={accessibleName}
        aria-selected={selected}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onPointerDown={(event) => {
          onSelect(event);
          if (!editing) onBeginDrag(event);
        }}
        onDoubleClick={(event) => {
          event.stopPropagation();
          if (isBundle) onExpand?.();
          else onEdit();
        }}
        className="absolute flex flex-col rounded-[var(--sb-radius-card)]"
        style={{
          left: item.x,
          top: item.y,
          width: item.width,
          height: item.height,
          zIndex: item.zIndex + (item.pinned ? 10_000 : 0),
          background: noteBackground(item.colour),
          border: selected ? '2px solid var(--sb-accent)' : '1px solid var(--sb-border)',
          // Compensate for the thicker selected border so the card does not shift.
          padding: selected ? 9 : 10,
          boxShadow: selected ? 'var(--sb-shadow-float)' : 'var(--sb-shadow-card)',
          cursor: editing ? 'text' : 'grab',
          touchAction: 'none',
        }}
      >
        {selected && !editing && !isBundle ? (
          <NoteToolbar
            item={item}
            editing={editing}
            onFormat={format}
            onColour={onColour}
            onPin={onPin}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
            onProject={onProject}
          />
        ) : null}
        {editing && item.itemType === 'text' ? (
          <NoteToolbar
            item={item}
            editing
            onFormat={format}
            onColour={onColour}
            onPin={onPin}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
            onProject={onProject}
          />
        ) : null}

        {item.pinned ? (
          <span
            className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full"
            style={{ background: 'var(--sb-accent)', color: 'var(--sb-text-on-accent)' }}
            title="Pinned"
          >
            <Pin size={11} aria-hidden="true" />
            <span className="sb-sr-only">Pinned</span>
          </span>
        ) : null}

        {isBundle ? (
          <span
            className="absolute -left-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-medium"
            style={{ background: 'var(--sb-accent)', color: 'var(--sb-text-on-accent)' }}
            title={`Stack of ${bundleCount} notes — double-click to expand`}
          >
            {bundleCount}
          </span>
        ) : null}

        <div className="min-h-0 flex-1">
          <NoteBody
            item={item}
            editing={editing}
            onContentChange={onContentChange}
            onFinish={onFinishEdit}
          />
        </div>

        <footer
          className="mt-1 flex shrink-0 items-center justify-between gap-2 text-[10px]"
          style={{ color: 'var(--sb-text-subtle)' }}
        >
          {/* The colour name appears in text so colour is never the only signal. */}
          <span className="truncate">
            {isBundle
              ? `Stack of ${bundleCount}`
              : item.colour === 'neutral'
                ? ITEM_TYPE_LABELS[item.itemType]
                : NOTE_COLOUR_LABELS[item.colour]}
            {item.project ? ` · ${item.project}` : ''}
          </span>
          <time dateTime={item.updatedAt} title={`Created ${formatRelative(item.createdAt)}`}>
            {formatRelative(item.updatedAt)}
          </time>
        </footer>

        {selected && !isBundle
          ? RESIZE_HANDLES.map((handle) => (
              <span
                key={handle}
                role="presentation"
                onPointerDown={(event) => {
                  event.stopPropagation();
                  onBeginResize(handle as ResizeHandle, event);
                }}
                className="absolute h-2.5 w-2.5 rounded-sm"
                style={{
                  ...HANDLE_POSITION[handle as ResizeHandle],
                  background: 'var(--sb-surface-raised)',
                  border: '1px solid var(--sb-accent)',
                  cursor: HANDLE_CURSORS[handle as ResizeHandle],
                  touchAction: 'none',
                }}
                aria-label={`Resize from ${HANDLE_LABELS[handle as ResizeHandle]}`}
              />
            ))
          : null}
      </article>
    </>
  );
});

function NoteBody({
  item,
  editing,
  onContentChange,
  onFinish,
}: {
  item: Item;
  editing: boolean;
  onContentChange: (content: ItemContent) => void;
  onFinish: () => void;
}) {
  switch (item.content.kind) {
    case 'text':
      return (
        <RichTextEditor
          html={item.content.html}
          editing={editing}
          placeholder="Write anything…"
          ariaLabel="Note text"
          onChange={(html) => onContentChange({ kind: 'text', html })}
          onFinish={onFinish}
        />
      );
    case 'checklist':
      return (
        <ChecklistBody
          title={item.content.title}
          entries={item.content.entries}
          editing={editing}
          onChange={onContentChange}
          onFinish={onFinish}
        />
      );
    case 'link':
      return <LinkCardBody content={item.content} onChange={onContentChange} />;
    case 'image':
      return <ImageCardBody content={item.content} onChange={onContentChange} />;
    case 'file':
      return <FileCardBody content={item.content} onChange={onContentChange} />;
  }
}
