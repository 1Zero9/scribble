import { useRef, useState } from 'react';
import type { InkPoint, Viewport } from '@/types/domain';
import { newId } from '@/lib/ids';
import { screenToPad } from '@/lib/geometry';
import { useDeskStore } from '@/store/deskStore';
import { useUiStore } from '@/store/uiStore';
import { effectiveWidth, simplify, strokeHitTest, strokeToPath } from './inkGeometry';

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
  const eraseInk = useDeskStore((state) => state.eraseInk);
  const activePadId = useDeskStore((state) => state.activePadId);
  const announce = useUiStore((state) => state.announce);

  const [draft, setDraft] = useState<InkPoint[]>([]);
  const drawing = useRef(false);
  const surfaceRef = useRef<SVGSVGElement>(null);

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

  function eraseAt(point: InkPoint): void {
    const hits = strokes
      .filter((stroke) => strokeHitTest(stroke, point, 8 / viewport.zoom))
      .map((stroke) => stroke.id);
    if (hits.length > 0) void eraseInk(hits);
  }

  function handlePointerMove(event: React.PointerEvent<SVGSVGElement>): void {
    if (!drawing.current) return;
    const point = toPad(event);
    if (mode === 'eraser') {
      eraseAt(point);
      return;
    }
    setDraft((current) => [...current, point]);
  }

  function handlePointerUp(): void {
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

  return (
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
        {strokes.map((stroke) => (
          <path
            key={stroke.id}
            d={strokeToPath(stroke.points)}
            fill="none"
            stroke={stroke.colour}
            strokeWidth={effectiveWidth(stroke)}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
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
  );
}
