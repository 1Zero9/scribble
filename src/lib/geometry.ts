import {
  GRID_SIZE,
  MAX_ZOOM,
  MIN_ITEM_HEIGHT,
  MIN_ITEM_WIDTH,
  MIN_ZOOM,
  type Point,
  type Rect,
  type Viewport,
} from '@/types/domain';

/**
 * Pure geometry for the deskpad.
 *
 * Nothing in this module touches React, the DOM or storage, so every rule is
 * directly unit testable.
 */

export function snapValue(value: number, gridSize: number = GRID_SIZE): number {
  if (gridSize <= 0) return value;
  return Math.round(value / gridSize) * gridSize;
}

export function snapPoint(point: Point, enabled: boolean, gridSize = GRID_SIZE): Point {
  if (!enabled) return { x: Math.round(point.x), y: Math.round(point.y) };
  return { x: snapValue(point.x, gridSize), y: snapValue(point.y, gridSize) };
}

export function clampSize(width: number, height: number): { width: number; height: number } {
  return {
    width: Math.max(MIN_ITEM_WIDTH, Math.round(width)),
    height: Math.max(MIN_ITEM_HEIGHT, Math.round(height)),
  };
}

export function snapSize(
  width: number,
  height: number,
  enabled: boolean,
  gridSize = GRID_SIZE,
): { width: number; height: number } {
  const snapped = enabled
    ? { width: snapValue(width, gridSize), height: snapValue(height, gridSize) }
    : { width, height };
  return clampSize(snapped.width, snapped.height);
}

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(zoom.toFixed(3))));
}

/** Converts a screen-space point (relative to the surface) into pad coordinates. */
export function screenToPad(point: Point, viewport: Viewport): Point {
  return {
    x: (point.x - viewport.x) / viewport.zoom,
    y: (point.y - viewport.y) / viewport.zoom,
  };
}

/** Converts a pad-space point into screen space (relative to the surface). */
export function padToScreen(point: Point, viewport: Viewport): Point {
  return {
    x: point.x * viewport.zoom + viewport.x,
    y: point.y * viewport.zoom + viewport.y,
  };
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/** The overlap area as a fraction of the smaller rectangle's area, 0 to 1. */
export function overlapFraction(a: Rect, b: Rect): number {
  const overlapWidth = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const overlapHeight = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const smaller = Math.min(a.width * a.height, b.width * b.height);
  return smaller <= 0 ? 0 : (overlapWidth * overlapHeight) / smaller;
}

/** Normalises a drag-selection marquee described by two corners. */
export function normaliseRect(start: Point, end: Point): Rect {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

export function boundingBox(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export type PositionedRect = Rect & { id: string };
export type AlignAxis = 'left' | 'right' | 'top' | 'bottom' | 'centre-x' | 'centre-y';

/** Returns only the rectangles whose position changes, keyed by id. */
export function align(rects: readonly PositionedRect[], axis: AlignAxis): Record<string, Point> {
  const box = boundingBox(rects);
  if (!box || rects.length < 2) return {};

  const moves: Record<string, Point> = {};
  for (const rect of rects) {
    let { x, y } = rect;
    switch (axis) {
      case 'left':
        x = box.x;
        break;
      case 'right':
        x = box.x + box.width - rect.width;
        break;
      case 'top':
        y = box.y;
        break;
      case 'bottom':
        y = box.y + box.height - rect.height;
        break;
      case 'centre-x':
        x = box.x + (box.width - rect.width) / 2;
        break;
      case 'centre-y':
        y = box.y + (box.height - rect.height) / 2;
        break;
    }
    x = Math.round(x);
    y = Math.round(y);
    if (x !== rect.x || y !== rect.y) moves[rect.id] = { x, y };
  }
  return moves;
}

/**
 * Distributes rectangles so the gaps between them are equal along one axis.
 * The outermost rectangles stay where they are.
 */
export function distribute(
  rects: readonly PositionedRect[],
  axis: 'horizontal' | 'vertical',
): Record<string, Point> {
  if (rects.length < 3) return {};

  const horizontal = axis === 'horizontal';
  const sorted = [...rects].sort((a, b) => (horizontal ? a.x - b.x : a.y - b.y));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) return {};

  const start = horizontal ? first.x : first.y;
  const end = horizontal ? last.x + last.width : last.y + last.height;
  const span = end - start;
  const occupied = sorted.reduce((sum, r) => sum + (horizontal ? r.width : r.height), 0);
  const gap = (span - occupied) / (sorted.length - 1);

  const moves: Record<string, Point> = {};
  let cursor = start;
  for (const rect of sorted) {
    const target = Math.round(cursor);
    if (horizontal) {
      if (target !== rect.x) moves[rect.id] = { x: target, y: rect.y };
      cursor += rect.width + gap;
    } else {
      if (target !== rect.y) moves[rect.id] = { x: rect.x, y: target };
      cursor += rect.height + gap;
    }
  }
  return moves;
}

export interface TidyOptions {
  gridSize?: number;
  gutter?: number;
  /** Maximum width of the tidied block, in pad units. */
  maxWidth?: number;
}

/**
 * Arranges rectangles into a tidy left-to-right, top-to-bottom flow starting at
 * the top-left of their current bounding box. Reading order is preserved by
 * sorting on row bands first, then on horizontal position.
 */
export function tidy(
  rects: readonly PositionedRect[],
  options: TidyOptions = {},
): Record<string, Point> {
  if (rects.length < 2) return {};

  const gridSize = options.gridSize ?? GRID_SIZE;
  const gutter = options.gutter ?? gridSize;
  const box = boundingBox(rects);
  if (!box) return {};

  const rowBand = Math.max(gridSize, 48);
  const ordered = [...rects].sort((a, b) => {
    const rowA = Math.floor(a.y / rowBand);
    const rowB = Math.floor(b.y / rowBand);
    if (rowA !== rowB) return rowA - rowB;
    return a.x - b.x;
  });

  const widest = Math.max(...ordered.map((r) => r.width));
  const columns = Math.max(1, Math.round(Math.sqrt(ordered.length)));
  const maxWidth = options.maxWidth ?? columns * (widest + gutter);

  const originX = snapValue(box.x, gridSize);
  const originY = snapValue(box.y, gridSize);

  const moves: Record<string, Point> = {};
  let cursorX = originX;
  let cursorY = originY;
  let rowHeight = 0;

  for (const rect of ordered) {
    if (cursorX > originX && cursorX + rect.width > originX + maxWidth) {
      cursorX = originX;
      cursorY += rowHeight + gutter;
      rowHeight = 0;
    }
    const x = snapValue(cursorX, gridSize);
    const y = snapValue(cursorY, gridSize);
    if (x !== rect.x || y !== rect.y) moves[rect.id] = { x, y };
    cursorX = x + rect.width + gutter;
    rowHeight = Math.max(rowHeight, rect.height);
  }

  return moves;
}

/**
 * Finds a free position near `preferred` so a newly created note does not land
 * exactly on top of an existing one.
 */
export function findFreePosition(
  preferred: Point,
  size: { width: number; height: number },
  occupied: readonly Rect[],
  gridSize = GRID_SIZE,
): Point {
  const step = gridSize;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const candidate: Rect = {
      x: preferred.x + attempt * step,
      y: preferred.y + attempt * step,
      width: size.width,
      height: size.height,
    };
    const collides = occupied.some(
      (rect) =>
        Math.abs(rect.x - candidate.x) < step / 2 && Math.abs(rect.y - candidate.y) < step / 2,
    );
    if (!collides) return { x: candidate.x, y: candidate.y };
  }
  return preferred;
}
