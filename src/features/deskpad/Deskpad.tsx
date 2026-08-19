import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_ITEM_HEIGHT,
  DEFAULT_ITEM_WIDTH,
  MIN_ITEM_HEIGHT,
  MIN_ITEM_WIDTH,
  type Item,
  type ItemContent,
  type NoteColour,
  type Point,
  type Rect,
  type Uuid,
} from '@/types/domain';
import {
  clampZoom,
  normaliseRect,
  overlapFraction,
  rectsIntersect,
  screenToPad,
  snapPoint,
  snapValue,
} from '@/lib/geometry';
import { selectActivePad, useDeskStore } from '@/store/deskStore';
import { useUiStore } from '@/store/uiStore';
import { NoteCard } from '@/features/notes/NoteCard';
import type { ResizeHandle } from '@/features/notes/noteStyles';
import { InkLayer } from '@/features/ink/InkLayer';
import { InkToolbar } from '@/features/ink/InkToolbar';
import { GridBackground } from './GridBackground';
import { SelectionActions } from './SelectionActions';
import { captureFromDataTransfer, cascade } from './capture';
import { describeError } from '@/services/logging/logger';

type DragSession =
  | { kind: 'none' }
  | {
      kind: 'move';
      pointerId: number;
      origin: Point;
      items: Map<Uuid, Point>;
      moved: boolean;
      free: boolean;
    }
  | {
      kind: 'resize';
      pointerId: number;
      itemId: Uuid;
      handle: ResizeHandle;
      origin: Point;
      start: Rect;
      free: boolean;
    }
  | { kind: 'marquee'; pointerId: number; origin: Point; additive: boolean }
  | { kind: 'pan'; pointerId: number; origin: Point; startViewport: Point };

/**
 * The deskpad surface.
 *
 * This component owns pointer interaction for the whole canvas — creating,
 * moving, resizing, marquee selection, panning, zooming, dropping and pasting —
 * and delegates everything else to the store or to child components. Geometry
 * decisions are made by pure helpers in `lib/geometry`, which keeps the rules
 * testable independently of the DOM.
 */
export function Deskpad() {
  const pad = useDeskStore(selectActivePad);
  const items = useDeskStore((state) => state.items);
  const viewport = useDeskStore((state) => state.viewport);
  const selection = useDeskStore((state) => state.selection);
  const editingItemId = useDeskStore((state) => state.editingItemId);

  const setViewport = useDeskStore((state) => state.setViewport);
  const setSelection = useDeskStore((state) => state.setSelection);
  const toggleSelection = useDeskStore((state) => state.toggleSelection);
  const clearSelection = useDeskStore((state) => state.clearSelection);
  const setEditingItem = useDeskStore((state) => state.setEditingItem);
  const createItem = useDeskStore((state) => state.createItem);
  const createPad = useDeskStore((state) => state.createPad);
  const updateItem = useDeskStore((state) => state.updateItem);
  const updateItems = useDeskStore((state) => state.updateItems);
  const duplicateItems = useDeskStore((state) => state.duplicateItems);
  const deleteItems = useDeskStore((state) => state.deleteItems);
  const bringToFront = useDeskStore((state) => state.bringToFront);
  const bundleItems = useDeskStore((state) => state.bundleItems);
  const expandBundle = useDeskStore((state) => state.expandBundle);

  const tool = useUiStore((state) => state.tool);
  const notify = useUiStore((state) => state.notify);
  const announce = useUiStore((state) => state.announce);

  const surfaceRef = useRef<HTMLDivElement>(null);
  const session = useRef<DragSession>({ kind: 'none' });
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const [inkColour, setInkColour] = useState('var(--sb-ink-1)');
  const [inkWidth, setInkWidth] = useState(3);

  const snapEnabled = pad?.snapEnabled ?? true;

  // Drawing or erasing sits visually above every note; a note left mid-edit
  // when the tool changes would stay open but unreachable underneath it.
  useEffect(() => {
    if (tool !== 'select') setEditingItem(null);
  }, [tool, setEditingItem]);

  // A bundle is collapsed for as long as its members sit at the same position —
  // no separate flag is stored, so dragging members apart (via expandBundle) or
  // back together (via the normal drag-to-overlap gesture) is naturally reversible.
  const visibleItems = useMemo(() => {
    const byBundle = new Map<Uuid, Item[]>();
    for (const item of items) {
      if (item.bundleId === null) continue;
      const list = byBundle.get(item.bundleId);
      if (list) list.push(item);
      else byBundle.set(item.bundleId, [item]);
    }

    const hidden = new Set<Uuid>();
    const counts = new Map<Uuid, number>();
    for (const members of byBundle.values()) {
      if (members.length < 2) continue;
      const first = members[0];
      if (!first) continue;
      const collapsed = members.every((m) => m.x === first.x && m.y === first.y);
      if (!collapsed) continue;
      const representative = members.reduce((a, b) => (b.zIndex > a.zIndex ? b : a));
      for (const member of members) if (member.id !== representative.id) hidden.add(member.id);
      counts.set(representative.id, members.length);
    }

    return items
      .filter((item) => !hidden.has(item.id))
      .map((item) => ({ item, bundleCount: counts.get(item.id) ?? 1 }));
  }, [items]);

  /** Merges a dragged note into whatever it was dropped onto, if anything. */
  const maybeBundle = useCallback(
    (draggedId: Uuid) => {
      const dragged = items.find((candidate) => candidate.id === draggedId);
      if (!dragged) return;
      const target = items.find(
        (candidate) => candidate.id !== draggedId && overlapFraction(dragged, candidate) > 0.6,
      );
      if (target) void bundleItems(draggedId, target.id);
    },
    [items, bundleItems],
  );

  const toPad = useCallback(
    (clientX: number, clientY: number): Point => {
      const bounds = surfaceRef.current?.getBoundingClientRect();
      return screenToPad(
        { x: clientX - (bounds?.left ?? 0), y: clientY - (bounds?.top ?? 0) },
        viewport,
      );
    },
    [viewport],
  );

  /** Creates a note at a point in pad coordinates. */
  const createNoteAt = useCallback(
    (point: Point) => {
      void createItem(
        'text',
        { kind: 'text', html: '' },
        { x: point.x - DEFAULT_ITEM_WIDTH / 2, y: point.y - 24 },
      );
    },
    [createItem],
  );

  // ---- Pointer interaction -------------------------------------------------

  function handleSurfacePointerDown(event: React.PointerEvent<HTMLDivElement>): void {
    if (tool !== 'select') return;
    if (event.target !== event.currentTarget) return;

    // Middle button or space-drag pans the pad.
    if (event.button === 1 || event.altKey) {
      session.current = {
        kind: 'pan',
        pointerId: event.pointerId,
        origin: { x: event.clientX, y: event.clientY },
        startViewport: { x: viewport.x, y: viewport.y },
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    if (event.button !== 0) return;

    setEditingItem(null);
    session.current = {
      kind: 'marquee',
      pointerId: event.pointerId,
      origin: toPad(event.clientX, event.clientY),
      additive: event.shiftKey,
    };
    if (!event.shiftKey) clearSelection();
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>): void {
    const current = session.current;
    if (current.kind === 'none') return;

    if (current.kind === 'pan') {
      setViewport({
        x: current.startViewport.x + (event.clientX - current.origin.x),
        y: current.startViewport.y + (event.clientY - current.origin.y),
        zoom: viewport.zoom,
      });
      return;
    }

    const point = toPad(event.clientX, event.clientY);

    if (current.kind === 'marquee') {
      const rect = normaliseRect(current.origin, point);
      setMarquee(rect);
      // Only visible cards can be marquee-selected; a collapsed stack's hidden
      // members select as one, via their representative card.
      const hits = visibleItems
        .filter(({ item }) => rectsIntersect(rect, item))
        .map(({ item }) => item.id);
      setSelection(current.additive ? [...new Set([...selection, ...hits])] : hits);
      return;
    }

    if (current.kind === 'move') {
      const dx = point.x - current.origin.x;
      const dy = point.y - current.origin.y;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) current.moved = true;
      const free = current.free || event.altKey;

      for (const [id, start] of current.items) {
        const next = snapPoint({ x: start.x + dx, y: start.y + dy }, snapEnabled && !free);
        updateItem(id, { x: next.x, y: next.y });
      }
      return;
    }

    if (current.kind === 'resize') {
      const dx = point.x - current.origin.x;
      const dy = point.y - current.origin.y;
      const free = current.free || event.altKey;
      const next = applyResize(current.start, current.handle, dx, dy);
      const snap = (value: number) => (snapEnabled && !free ? snapValue(value) : Math.round(value));

      updateItem(current.itemId, {
        x: snap(next.x),
        y: snap(next.y),
        width: Math.max(MIN_ITEM_WIDTH, snap(next.width)),
        height: Math.max(MIN_ITEM_HEIGHT, snap(next.height)),
      });
    }
  }

  function handlePointerUp(): void {
    const current = session.current;
    session.current = { kind: 'none' };
    setMarquee(null);

    if (current.kind === 'move' || current.kind === 'resize') {
      // Persist the final geometry immediately rather than waiting for autosave.
      const affected = current.kind === 'move' ? [...current.items.keys()] : [current.itemId];
      const patches = items
        .filter((item) => affected.includes(item.id))
        .map((item) => ({
          id: item.id,
          patch: { x: item.x, y: item.y, width: item.width, height: item.height },
        }));
      void updateItems(patches);

      // Only a single dragged note (not a multi-select move) can start a bundle.
      const draggedId = affected[0];
      if (current.kind === 'move' && current.moved && affected.length === 1 && draggedId) {
        maybeBundle(draggedId);
      }
    }
  }

  const beginDrag = useCallback(
    (item: Item, event: React.PointerEvent) => {
      if (tool !== 'select' || event.button !== 0) return;
      let ids = selection.includes(item.id) ? selection : [item.id];
      // Dragging a collapsed stack by its visible card moves every note in it.
      if (ids.length === 1 && item.bundleId !== null) {
        const mates = items.filter(
          (candidate) =>
            candidate.bundleId === item.bundleId &&
            candidate.x === item.x &&
            candidate.y === item.y,
        );
        if (mates.length > 1) ids = mates.map((mate) => mate.id);
      }
      const positions = new Map<Uuid, Point>();
      for (const candidate of items) {
        if (ids.includes(candidate.id))
          positions.set(candidate.id, { x: candidate.x, y: candidate.y });
      }
      session.current = {
        kind: 'move',
        pointerId: event.pointerId,
        origin: toPad(event.clientX, event.clientY),
        items: positions,
        moved: false,
        free: event.altKey,
      };
      surfaceRef.current?.setPointerCapture(event.pointerId);
    },
    [items, selection, tool, toPad],
  );

  const beginResize = useCallback(
    (item: Item, handle: ResizeHandle, event: React.PointerEvent) => {
      session.current = {
        kind: 'resize',
        pointerId: event.pointerId,
        itemId: item.id,
        handle,
        origin: toPad(event.clientX, event.clientY),
        start: { x: item.x, y: item.y, width: item.width, height: item.height },
        free: event.altKey,
      };
      surfaceRef.current?.setPointerCapture(event.pointerId);
    },
    [toPad],
  );

  // ---- Wheel: zoom with Ctrl, pan otherwise --------------------------------

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;

    function onWheel(event: WheelEvent): void {
      if (event.ctrlKey) {
        event.preventDefault();
        const bounds = surface?.getBoundingClientRect();
        const cursor = {
          x: event.clientX - (bounds?.left ?? 0),
          y: event.clientY - (bounds?.top ?? 0),
        };
        const nextZoom = clampZoom(viewport.zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1));
        const scale = nextZoom / viewport.zoom;
        setViewport({
          zoom: nextZoom,
          x: cursor.x - (cursor.x - viewport.x) * scale,
          y: cursor.y - (cursor.y - viewport.y) * scale,
        });
        return;
      }
      event.preventDefault();
      setViewport({
        x: viewport.x - event.deltaX,
        y: viewport.y - event.deltaY,
        zoom: viewport.zoom,
      });
    }

    surface.addEventListener('wheel', onWheel, { passive: false });
    return () => surface.removeEventListener('wheel', onWheel);
  }, [setViewport, viewport]);

  // ---- Drop and paste ------------------------------------------------------

  const capture = useCallback(
    async (data: DataTransfer, at: Point) => {
      try {
        const outcome = await captureFromDataTransfer(data);
        for (const [index, entry] of outcome.captured.entries()) {
          await createItem(entry.itemType, entry.content, cascade(at, index), {
            ...(entry.width === undefined ? {} : { width: entry.width }),
            ...(entry.height === undefined ? {} : { height: entry.height }),
            focus: entry.itemType === 'text',
          });
        }
        for (const reason of outcome.rejected) notify(reason, 'warning');
        if (outcome.captured.length > 0) {
          announce(
            `${outcome.captured.length} item${outcome.captured.length === 1 ? '' : 's'} added.`,
          );
        }
      } catch (error) {
        notify(describeError(error, 'That content could not be added.'), 'error');
      }
    },
    [announce, createItem, notify],
  );

  useEffect(() => {
    // The clipboard is read only in response to an explicit paste, and only
    // when the deskpad itself is the focus. Scribble never polls or watches the
    // clipboard, and a paste aimed at a text field, a panel or any other part of
    // the interface is left alone.
    function onPaste(event: ClipboardEvent): void {
      if (useUiStore.getState().panel !== null) return;

      const target = event.target;
      if (target instanceof HTMLElement) {
        if (target.isContentEditable) return;
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      }

      const surface = surfaceRef.current;
      const active = document.activeElement;
      const focusedOnDeskpad =
        active === null || active === document.body || (surface?.contains(active) ?? false);
      if (!focusedOnDeskpad) return;
      if (!event.clipboardData) return;

      event.preventDefault();
      const bounds = surface?.getBoundingClientRect();
      const centre = screenToPad(
        { x: (bounds?.width ?? 800) / 2, y: (bounds?.height ?? 600) / 3 },
        viewport,
      );
      void capture(event.clipboardData, centre);
    }

    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [capture, viewport]);

  // ---- Rendering -----------------------------------------------------------

  const editing = editingItemId;

  return (
    <div
      className="relative min-h-0 flex-1 overflow-hidden"
      style={{ background: 'var(--sb-deskpad)' }}
    >
      <GridBackground gridType={pad?.gridType ?? 'dots'} viewport={viewport} />

      <div
        ref={surfaceRef}
        data-testid="deskpad-surface"
        role="application"
        aria-label="Deskpad. Double-click to add a note. Use the capture toolbar for other actions."
        tabIndex={-1}
        // `isolate` keeps the cards and the ink layer in their own stacking
        // context, so their z-indices cannot rise above the floating toolbars.
        className="absolute inset-0 isolate"
        style={{ touchAction: 'none', cursor: tool === 'select' ? 'default' : 'crosshair' }}
        onPointerDown={handleSurfacePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={(event) => {
          if (tool !== 'select' || event.target !== event.currentTarget) return;
          createNoteAt(toPad(event.clientX, event.clientY));
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
          setDropActive(true);
        }}
        onDragLeave={(event) => {
          if (event.target === event.currentTarget) setDropActive(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDropActive(false);
          void capture(event.dataTransfer, toPad(event.clientX, event.clientY));
        }}
      >
        <InkLayer viewport={viewport} mode={tool} colour={inkColour} width={inkWidth} />

        <div
          className="absolute left-0 top-0"
          style={{
            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
            transformOrigin: '0 0',
          }}
        >
          {visibleItems.map(({ item, bundleCount }) => (
            <NoteCard
              key={item.id}
              item={item}
              selected={selection.includes(item.id)}
              editing={editing === item.id}
              snapEnabled={snapEnabled}
              bundleCount={bundleCount}
              onExpand={item.bundleId ? () => void expandBundle(item.bundleId!) : undefined}
              onSelect={(event) => {
                if (event.shiftKey) toggleSelection(item.id);
                else if (!selection.includes(item.id)) setSelection([item.id]);
                bringToFront(item.id);
              }}
              onBeginDrag={(event) => beginDrag(item, event)}
              onBeginResize={(handle, event) => beginResize(item, handle, event)}
              onEdit={() => setEditingItem(item.id)}
              onFinishEdit={() => setEditingItem(null)}
              onContentChange={(content: ItemContent) => updateItem(item.id, { content })}
              onColour={(colour: NoteColour) => updateItem(item.id, { colour }, true)}
              onPin={() => updateItem(item.id, { pinned: !item.pinned }, true)}
              onProject={(project) => updateItem(item.id, { project }, true)}
              onDuplicate={() => void duplicateItems([item.id])}
              onDelete={() => void deleteItems(selection.includes(item.id) ? selection : [item.id])}
              onNudge={(dx, dy) => updateItem(item.id, { x: item.x + dx, y: item.y + dy }, true)}
              onResizeBy={(dw, dh) =>
                updateItem(
                  item.id,
                  {
                    width: Math.max(MIN_ITEM_WIDTH, item.width + dw),
                    height: Math.max(MIN_ITEM_HEIGHT, item.height + dh),
                  },
                  true,
                )
              }
            />
          ))}
        </div>

        {marquee ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute"
            style={{
              left: marquee.x * viewport.zoom + viewport.x,
              top: marquee.y * viewport.zoom + viewport.y,
              width: marquee.width * viewport.zoom,
              height: marquee.height * viewport.zoom,
              border: '1px solid var(--sb-accent)',
              background: 'var(--sb-accent-soft)',
              opacity: 0.5,
            }}
          />
        ) : null}
      </div>

      {dropActive ? (
        <div
          className="pointer-events-none absolute inset-3 rounded-[var(--sb-radius-card)]"
          style={{
            border: '2px dashed var(--sb-accent)',
            background: 'var(--sb-accent-soft)',
            opacity: 0.35,
          }}
          aria-hidden="true"
        />
      ) : null}

      {pad === null ? (
        <NoPadState onCreate={() => void createPad()} />
      ) : items.length === 0 ? (
        <EmptyState onCreate={() => createNoteAt({ x: 120, y: 120 })} />
      ) : null}

      {tool !== 'select' ? (
        <InkToolbar
          colour={inkColour}
          width={inkWidth}
          onColour={setInkColour}
          onWidth={setInkWidth}
        />
      ) : null}

      <SelectionActions />
    </div>
  );
}

function NoPadState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="pointer-events-auto max-w-sm text-center">
        <p className="text-base font-medium">No pad is open.</p>
        <p className="mt-1 text-sm" style={{ color: 'var(--sb-text-muted)' }}>
          Start a new pad, or open one from the Drawer.
        </p>
        <button type="button" className="sb-button sb-button--primary mt-4" onClick={onCreate}>
          New pad
        </button>
      </div>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="pointer-events-auto max-w-sm text-center">
        <p className="text-base font-medium">This pad is empty.</p>
        <p className="mt-1 text-sm" style={{ color: 'var(--sb-text-muted)' }}>
          Double-click anywhere to start writing, drop something in, or use the toolbar below.
          Capture first — organise later.
        </p>
        <button type="button" className="sb-button sb-button--primary mt-4" onClick={onCreate}>
          Add a note
        </button>
      </div>
    </div>
  );
}

/** Applies a resize handle's effect to a rectangle. Kept beside its only caller. */
function applyResize(start: Rect, handle: ResizeHandle, dx: number, dy: number): Rect {
  let { x, y, width, height } = start;

  if (handle.includes('e')) width = start.width + dx;
  if (handle.includes('s')) height = start.height + dy;
  if (handle.includes('w')) {
    width = start.width - dx;
    x = start.x + dx;
  }
  if (handle.includes('n')) {
    height = start.height - dy;
    y = start.y + dy;
  }

  if (width < MIN_ITEM_WIDTH) {
    if (handle.includes('w')) x = start.x + start.width - MIN_ITEM_WIDTH;
    width = MIN_ITEM_WIDTH;
  }
  if (height < MIN_ITEM_HEIGHT) {
    if (handle.includes('n')) y = start.y + start.height - MIN_ITEM_HEIGHT;
    height = MIN_ITEM_HEIGHT;
  }

  return { x, y, width, height };
}

export { DEFAULT_ITEM_HEIGHT };
