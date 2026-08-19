import { Eraser, MousePointer2, Pencil, Redo2, Undo2 } from 'lucide-react';
import { useDeskStore } from '@/store/deskStore';
import { useUiStore } from '@/store/uiStore';
import { INK_COLOURS, INK_WIDTHS } from './inkGeometry';

interface InkToolbarProps {
  colour: string;
  width: number;
  onColour: (colour: string) => void;
  onWidth: (width: number) => void;
}

/** Pen settings. Shown only while the ink or eraser tool is active. */
export function InkToolbar({ colour, width, onColour, onWidth }: InkToolbarProps) {
  const tool = useUiStore((state) => state.tool);
  const setTool = useUiStore((state) => state.setTool);
  const undoInk = useDeskStore((state) => state.undoInk);
  const redoInk = useDeskStore((state) => state.redoInk);
  const canUndo = useDeskStore((state) => state.inkUndo.length > 0);
  const canRedo = useDeskStore((state) => state.inkRedo.length > 0);

  return (
    <div
      className="sb-panel absolute left-1/2 top-3 z-30 flex w-max max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center gap-1 overflow-x-auto px-2 py-1.5"
      role="toolbar"
      aria-label="Pen and ink"
    >
      <button
        type="button"
        className="sb-icon-button"
        style={{ width: 36, height: 36 }}
        aria-pressed={tool === 'select'}
        onClick={() => setTool('select')}
        title="Select (V)"
      >
        <MousePointer2 size={16} aria-hidden="true" />
        <span className="sb-sr-only">Select tool</span>
      </button>
      <button
        type="button"
        className="sb-icon-button"
        style={{ width: 36, height: 36 }}
        aria-pressed={tool === 'ink'}
        onClick={() => setTool('ink')}
        title="Pen (P)"
      >
        <Pencil size={16} aria-hidden="true" />
        <span className="sb-sr-only">Pen tool</span>
      </button>
      <button
        type="button"
        className="sb-icon-button"
        style={{ width: 36, height: 36 }}
        aria-pressed={tool === 'eraser'}
        onClick={() => setTool('eraser')}
        title="Eraser (E)"
      >
        <Eraser size={16} aria-hidden="true" />
        <span className="sb-sr-only">Eraser tool</span>
      </button>

      <span
        className="mx-1 h-6 w-px"
        style={{ background: 'var(--sb-border)' }}
        aria-hidden="true"
      />

      <fieldset className="flex items-center gap-1 border-0 p-0">
        <legend className="sb-sr-only">Pen colour</legend>
        {INK_COLOURS.map((option) => (
          <button
            key={option.label}
            type="button"
            className="h-6 w-6 rounded-full"
            style={{
              background: option.token,
              border:
                colour === option.token
                  ? '2px solid var(--sb-accent)'
                  : '1px solid var(--sb-border)',
              outlineOffset: 2,
            }}
            aria-pressed={colour === option.token}
            aria-label={`${option.label} pen`}
            title={option.label}
            onClick={() => onColour(option.token)}
          />
        ))}
      </fieldset>

      <span
        className="mx-1 h-6 w-px"
        style={{ background: 'var(--sb-border)' }}
        aria-hidden="true"
      />

      <fieldset className="flex items-center gap-1 border-0 p-0">
        <legend className="sb-sr-only">Stroke width</legend>
        {INK_WIDTHS.map((option) => (
          <button
            key={option.label}
            type="button"
            className="sb-icon-button"
            style={{ width: 32, height: 32 }}
            aria-pressed={width === option.value}
            aria-label={`${option.label} stroke`}
            title={option.label}
            onClick={() => onWidth(option.value)}
          >
            <span
              aria-hidden="true"
              className="rounded-full"
              style={{
                width: option.value * 2.2,
                height: option.value * 2.2,
                background: 'currentColor',
              }}
            />
          </button>
        ))}
      </fieldset>

      <span
        className="mx-1 h-6 w-px"
        style={{ background: 'var(--sb-border)' }}
        aria-hidden="true"
      />

      <button
        type="button"
        className="sb-icon-button"
        style={{ width: 36, height: 36 }}
        onClick={() => void undoInk()}
        disabled={!canUndo}
        title="Undo ink (Ctrl + Z)"
      >
        <Undo2 size={16} aria-hidden="true" />
        <span className="sb-sr-only">Undo ink</span>
      </button>
      <button
        type="button"
        className="sb-icon-button"
        style={{ width: 36, height: 36 }}
        onClick={() => void redoInk()}
        disabled={!canRedo}
        title="Redo ink (Ctrl + Shift + Z)"
      >
        <Redo2 size={16} aria-hidden="true" />
        <span className="sb-sr-only">Redo ink</span>
      </button>
    </div>
  );
}
