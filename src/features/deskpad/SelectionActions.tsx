import {
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  Copy,
  Palette,
  Trash2,
  WandSparkles,
} from 'lucide-react';
import { NOTE_COLOURS, NOTE_COLOUR_LABELS, type NoteColour } from '@/types/domain';
import { align, distribute, tidy, type PositionedRect } from '@/lib/geometry';
import { useDeskStore } from '@/store/deskStore';
import { useUiStore } from '@/store/uiStore';
import { noteBackground } from '@/features/notes/noteStyles';

/**
 * Actions for a multiple selection.
 *
 * Alignment, distribution and tidying are deliberate, explicit commands rather
 * than something that happens automatically while dragging — Scribble should
 * never rearrange a user's pad without being asked.
 */
export function SelectionActions() {
  const selection = useDeskStore((state) => state.selection);
  const items = useDeskStore((state) => state.items);
  const updateItems = useDeskStore((state) => state.updateItems);
  const duplicateItems = useDeskStore((state) => state.duplicateItems);
  const deleteItems = useDeskStore((state) => state.deleteItems);
  const openPanel = useUiStore((state) => state.openPanel);
  const announce = useUiStore((state) => state.announce);

  if (selection.length < 2) return null;

  const rects: PositionedRect[] = items
    .filter((item) => selection.includes(item.id))
    .map((item) => ({ id: item.id, x: item.x, y: item.y, width: item.width, height: item.height }));

  function apply(moves: Record<string, { x: number; y: number }>, description: string): void {
    const patches = Object.entries(moves).map(([id, point]) => ({ id, patch: point }));
    if (patches.length === 0) {
      announce('Nothing needed moving.');
      return;
    }
    void updateItems(patches);
    announce(`${description}. ${patches.length} notes moved.`);
  }

  function setColour(colour: NoteColour): void {
    void updateItems(selection.map((id) => ({ id, patch: { colour } })));
    announce(`${selection.length} notes changed to ${NOTE_COLOUR_LABELS[colour]}.`);
  }

  return (
    <div
      className="sb-panel absolute left-1/2 top-3 z-30 flex w-max max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center gap-1 overflow-x-auto px-2 py-1.5"
      role="toolbar"
      aria-label={`Actions for ${selection.length} selected notes`}
    >
      <span className="px-1 text-xs font-medium" style={{ color: 'var(--sb-text-muted)' }}>
        {selection.length} selected
      </span>
      <Divider />

      <Action label="Align left" onClick={() => apply(align(rects, 'left'), 'Aligned left')}>
        <AlignStartVertical size={16} />
      </Action>
      <Action label="Align right" onClick={() => apply(align(rects, 'right'), 'Aligned right')}>
        <AlignEndVertical size={16} />
      </Action>
      <Action label="Align top" onClick={() => apply(align(rects, 'top'), 'Aligned top')}>
        <AlignStartHorizontal size={16} />
      </Action>
      <Action label="Align bottom" onClick={() => apply(align(rects, 'bottom'), 'Aligned bottom')}>
        <AlignEndHorizontal size={16} />
      </Action>

      <Divider />

      <Action
        label="Distribute horizontally"
        onClick={() => apply(distribute(rects, 'horizontal'), 'Distributed horizontally')}
        disabled={rects.length < 3}
      >
        <AlignHorizontalDistributeCenter size={16} />
      </Action>
      <Action
        label="Distribute vertically"
        onClick={() => apply(distribute(rects, 'vertical'), 'Distributed vertically')}
        disabled={rects.length < 3}
      >
        <AlignVerticalDistributeCenter size={16} />
      </Action>
      <Action label="Tidy" onClick={() => apply(tidy(rects), 'Tidied')}>
        <WandSparkles size={16} />
      </Action>

      <Divider />

      <details className="relative">
        <summary
          className="sb-icon-button list-none"
          style={{ width: 34, height: 34 }}
          aria-label="Change colour of selected notes"
          title="Change colour"
        >
          <Palette size={16} aria-hidden="true" />
        </summary>
        <div
          className="absolute left-0 top-10 z-20 flex w-40 flex-wrap gap-1 rounded-[var(--sb-radius-control)] p-2"
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
              style={{ background: noteBackground(colour), border: '1px solid var(--sb-border)' }}
              aria-label={NOTE_COLOUR_LABELS[colour]}
              title={NOTE_COLOUR_LABELS[colour]}
              onClick={() => setColour(colour)}
            />
          ))}
        </div>
      </details>

      <Action label="Duplicate selected notes" onClick={() => void duplicateItems(selection)}>
        <Copy size={16} />
      </Action>
      <Action label="Organise selected notes" onClick={() => openPanel('organise')}>
        <WandSparkles size={16} />
      </Action>
      <Action label="Delete selected notes" onClick={() => void deleteItems(selection)} danger>
        <Trash2 size={16} />
      </Action>
    </div>
  );
}

function Divider() {
  return (
    <span
      className="mx-0.5 h-6 w-px"
      style={{ background: 'var(--sb-border)' }}
      aria-hidden="true"
    />
  );
}

function Action({
  label,
  onClick,
  children,
  disabled,
  danger,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className="sb-icon-button"
      style={{ width: 34, height: 34, ...(danger ? { color: 'var(--sb-danger)' } : {}) }}
      aria-label={label}
      title={label}
      disabled={disabled ?? false}
      onClick={onClick}
    >
      <span aria-hidden="true">{children}</span>
    </button>
  );
}
