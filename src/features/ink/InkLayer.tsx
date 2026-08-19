import { useRef, useState } from 'react';
import { Palette, Trash2 } from 'lucide-react';
import type { InkPoint, Uuid, Viewport } from '@/types/domain';
import { newId } from '@/lib/ids';
import { padToScreen, screenToPad } from '@/lib/geometry';
import { useDeskStore } from '@/store/deskStore';
import { useUiStore } from '@/store/uiStore';
import {
  effectiveWidth,
  INK_COLOURS,
  INK_WIDTHS,
  simplify,
  strokeBounds,
  strokeHitTest,
  strokeToPath,
} from './inkGeometry';

interface InkLayerProps {
  viewport: Viewport;
  /** `select` renders strokes only; `ink` draws; `eraser` removes. */
  mode: 'select' | 'ink' | 'eraser';
  colour: string;
  width: number;
}

/**
 * The ink layer.
 *
 * Ink and note cards share one deskpad surface: this layer sits under the cards
 * and uses the same pad coordinate system, so a stroke stays with the notes it
 * annotates when the pad is panned or zoomed.
 *
 * Input uses Pointer Events, which covers mouse, touch and stylus uniformly and
 * gives real pressure where the device reports it.
 */
export function InkLayer({ viewport, mode, colour, width }: InkLayerProps) {
  const strokes = useDeskStore((state) => state.ink);
  const addInkStroke = useDeskStore((state) => state.addInkStroke);
  const updateInkStroke = useDeskStore((state) => state.updateInkStroke);
  const eraseInk = useDeskStore((state) => state.eraseInk);
  const activePadId = useDeskStore((state) => state.activePadId);
  const selectedStrokeId = useDeskStore((state) => state.selectedStrokeId);
  const selectStroke = useDeskStore((state) => state.selectStroke);
  const announce = useUiStore((state) => state.announce);

  const [draft, setDraft] = useState<InkPoint[]>([]);
  const drawing = useRef(false);
  const surfaceRef = useRef<SVGSVGElement>(null);

  // A selected stroke drags as a live offset rather than rewriting every point on
  // every pointer move; only the final, shifted points are persisted.
  const movingStroke = useRef<{ id: Uuid; origin: InkPoint; points: InkPoint[] } | null>(null);
  const [moveDelta, setMoveDelta] = useState({ dx: 0, dy: 0 });

  function toPad(event: React.PointerEvent): InkPoint {
    const bounds = surfaceRef.current?.getBoundingClientRect();
    const point = screenToPad(
      { x: event.clientX - (bounds?.left ?? 0), y: event.clientY - (bounds?.top ?? 0) },
      viewport,
    );
    // Mice report a constant 0.5; genuine pens report their own pressure.
    const pressure = event.pressure > 0 && event.pressure !== 0.5 ? event.pressure : 0.5;
    return { x: point.x, y: point.y, pressure };
  }

  function handlePointerDown(event: React.PointerEvent<SVGSVGElement>): void {
    if (mode === 'select' || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = toPad(event);

    if (mode === 'eraser') {
      drawing.current = true;
      eraseAt(point);
      return;
    }
    drawing.current = true;
    setDraft([point]);
  }

  function handleStrokePointerDown(
    stroke: (typeof strokes)[number],
    event: React.PointerEvent<SVGPathElement>,
  ): void {
    if (mode !== 'select' || event.button !== 0) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    selectStroke(stroke.id);
    movingStroke.current = { id: stroke.id, origin: toPad(event), points: stroke.points };
    setMoveDelta({ dx: 0, dy: 0 });
  }

  function eraseAt(point: InkPoint): void {
    const hits = strokes
      .filter((stroke) => strokeHitTest(stroke, point, 8 / viewport.zoom))
      .map((stroke) => stroke.id);
    if (hits.length > 0) void eraseInk(hits);
  }

  function handlePointerMove(event: React.PointerEvent<SVGSVGElement>): void {
    if (movingStroke.current) {
      const point = toPad(event);
      setMoveDelta({
        dx: point.x - movingStroke.current.origin.x,
        dy: point.y - movingStroke.current.origin.y,
      });
      return;
    }
    if (!drawing.current) return;
    const point = toPad(event);
    if (mode === 'eraser') {
      eraseAt(point);
      return;
    }
    setDraft((current) => [...current, point]);
  }

  function handlePointerUp(): void {
    if (movingStroke.current) {
      const { id, points } = movingStroke.current;
      const { dx, dy } = moveDelta;
      movingStroke.current = null;
      if (dx !== 0 || dy !== 0) {
        updateInkStroke(id, {
          points: points.map((point) => ({ ...point, x: point.x + dx, y: point.y + dy })),
        });
      }
      setMoveDelta({ dx: 0, dy: 0 });
      return;
    }

    if (!drawing.current) return;
    drawing.current = false;

    if (mode === 'ink' && draft.length > 0 && activePadId !== null) {
      const points = simplify(draft);
      void addInkStroke({ id: newId(), padId: activePadId, colour, width, points });
      announce('Pen stroke added.');
    }
    setDraft([]);
  }

  const interactive = mode !== 'select';
  const selectedStroke =
    mode === 'select' ? (strokes.find((stroke) => stroke.id === selectedStrokeId) ?? null) : null;
  const selectedDisplayPoints = selectedStroke
    ? selectedStroke.points.map((point) => ({
        ...point,
        x: point.x + moveDelta.dx,
        y: point.y + moveDelta.dy,
      }))
    : null;
  const toolbarAnchor =
    selectedStroke && selectedDisplayPoints
      ? padToScreen(
          strokeBounds({ points: selectedDisplayPoints, width: selectedStroke.width }),
          viewport,
        )
      : null;

  return (
    <>
      <svg
        ref={surfaceRef}
        data-testid="ink-layer"
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
        style={{
          pointerEvents: interactive ? 'auto' : 'none',
          cursor: mode === 'eraser' ? 'cell' : mode === 'ink' ? 'crosshair' : 'default',
          touchAction: 'none',
          // While drawing, sit above every card, including pinned ones.
          zIndex: interactive ? 100_000 : 0,
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.zoom})`}>
          {strokes.map((stroke) => {
            const isSelected = stroke.id === selectedStrokeId;
            const points =
              isSelected && selectedDisplayPoints ? selectedDisplayPoints : stroke.points;
            return (
              <g key={stroke.id}>
                {isSelected ? (
                  <path
                    d={strokeToPath(points)}
                    fill="none"
                    stroke="var(--sb-accent)"
                    strokeWidth={effectiveWidth(stroke) + 7}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={0.35}
                  />
                ) : null}
                <path
                  d={strokeToPath(points)}
                  fill="none"
                  stroke={stroke.colour}
                  strokeWidth={effectiveWidth(stroke)}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {mode === 'select' ? (
                  <path
                    d={strokeToPath(stroke.points)}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={Math.max(14, effectiveWidth(stroke) + 10)}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ pointerEvents: 'stroke', cursor: 'grab' }}
                    onPointerDown={(event) => handleStrokePointerDown(stroke, event)}
                  />
                ) : null}
              </g>
            );
          })}
          {draft.length > 0 ? (
            <path
              d={strokeToPath(draft)}
              fill="none"
              stroke={colour}
              strokeWidth={effectiveWidth({ width, points: draft })}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}
        </g>
      </svg>

      {selectedStroke && toolbarAnchor ? (
        <StrokeToolbar
          x={toolbarAnchor.x}
          y={toolbarAnchor.y}
          colour={selectedStroke.colour}
          width={selectedStroke.width}
          onColour={(next) => updateInkStroke(selectedStroke.id, { colour: next })}
          onWidth={(next) => updateInkStroke(selectedStroke.id, { width: next })}
          onDelete={() => {
            void eraseInk([selectedStroke.id]);
            selectStroke(null);
          }}
        />
      ) : null}
    </>
  );
}

function StrokeToolbar({
  x,
  y,
  colour,
  width,
  onColour,
  onWidth,
  onDelete,
}: {
  x: number;
  y: number;
  colour: string;
  width: number;
  onColour: (colour: string) => void;
  onWidth: (width: number) => void;
  onDelete: () => void;
}) {
  return (
    <div
      className="absolute z-30 flex items-center gap-1 rounded-[var(--sb-radius-control)] px-1 py-1"
      role="toolbar"
      aria-label="Stroke actions"
      style={{
        left: x,
        top: y - 46,
        background: 'var(--sb-surface-raised)',
        border: '1px solid var(--sb-border)',
        boxShadow: 'var(--sb-shadow-float)',
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <details className="relative">
        <summary
          className="sb-icon-button list-none"
          style={{ width: 32, height: 32 }}
          aria-label="Stroke colour"
          title="Stroke colour"
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
          {INK_COLOURS.map((option) => (
            <button
              key={option.label}
              type="button"
              className="h-7 w-7 rounded-full"
              style={{
                background: option.token,
                border:
                  colour === option.token
                    ? '2px solid var(--sb-accent)'
                    : '1px solid var(--sb-border)',
              }}
              aria-label={`${option.label} pen`}
              aria-pressed={colour === option.token}
              title={option.label}
              onClick={() => onColour(option.token)}
            />
          ))}
        </div>
      </details>

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

      <button
        type="button"
        className="sb-icon-button"
        style={{ width: 32, height: 32, color: 'var(--sb-danger)' }}
        aria-label="Delete stroke"
        title="Delete stroke"
        onClick={onDelete}
      >
        <Trash2 size={15} aria-hidden="true" />
      </button>
    </div>
  );
}
