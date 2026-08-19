import type { InkPoint, InkStroke, Point, Rect } from '@/types/domain';

/**
 * Ink geometry.
 *
 * Strokes are stored as vector point data — never flattened to an image — so
 * they stay editable, eraseable and exportable after Scribble is reopened.
 */

/** Builds a smooth SVG path from a stroke's points using quadratic midpoints. */
export function strokeToPath(points: readonly InkPoint[]): string {
  if (points.length === 0) return '';
  const first = points[0];
  if (!first) return '';
  if (points.length === 1) {
    return `M ${first.x} ${first.y} L ${first.x + 0.01} ${first.y}`;
  }

  let path = `M ${first.x} ${first.y}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    if (!current || !next) continue;
    const midX = (current.x + next.x) / 2;
    const midY = (current.y + next.y) / 2;
    path += ` Q ${current.x} ${current.y} ${midX} ${midY}`;
  }
  const last = points[points.length - 1];
  if (last) path += ` L ${last.x} ${last.y}`;
  return path;
}

/** Average pressure decides the rendered width, so pens feel responsive. */
export function effectiveWidth(stroke: Pick<InkStroke, 'width' | 'points'>): number {
  if (stroke.points.length === 0) return stroke.width;
  const total = stroke.points.reduce((sum, point) => sum + point.pressure, 0);
  const average = total / stroke.points.length;
  return Math.max(0.6, stroke.width * (0.55 + average));
}

/** Drops points that are too close together to matter, keeping stored data small. */
export function simplify(points: readonly InkPoint[], minDistance = 1.4): InkPoint[] {
  if (points.length < 3) return [...points];
  const result: InkPoint[] = [];
  const first = points[0];
  if (first) result.push(first);

  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index];
    const previous = result[result.length - 1];
    if (!point || !previous) continue;
    const dx = point.x - previous.x;
    const dy = point.y - previous.y;
    if (Math.hypot(dx, dy) >= minDistance) result.push(point);
  }

  const last = points[points.length - 1];
  if (last) result.push(last);
  return result;
}

export function strokeBounds(stroke: Pick<InkStroke, 'points' | 'width'>): Rect {
  if (stroke.points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of stroke.points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  const pad = stroke.width;
  return {
    x: minX - pad,
    y: minY - pad,
    width: maxX - minX + pad * 2,
    height: maxY - minY + pad * 2,
  };
}

function distanceToSegment(point: Point, a: InkPoint, b: InkPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

/** True when a point lies within `tolerance` of any part of the stroke. */
export function strokeHitTest(
  stroke: Pick<InkStroke, 'points' | 'width'>,
  point: Point,
  tolerance = 6,
): boolean {
  const reach = tolerance + stroke.width / 2;
  const { points } = stroke;
  if (points.length === 1) {
    const only = points[0];
    return only !== undefined && Math.hypot(point.x - only.x, point.y - only.y) <= reach;
  }
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    if (!a || !b) continue;
    if (distanceToSegment(point, a, b) <= reach) return true;
  }
  return false;
}

export const INK_COLOURS = [
  { token: 'var(--sb-ink-1)', label: 'Charcoal' },
  { token: 'var(--sb-ink-2)', label: 'Teal' },
  { token: 'var(--sb-ink-3)', label: 'Red' },
  { token: 'var(--sb-ink-4)', label: 'Green' },
  { token: 'var(--sb-ink-5)', label: 'Violet' },
] as const;

export const INK_WIDTHS = [
  { value: 1.5, label: 'Fine' },
  { value: 3, label: 'Medium' },
  { value: 6, label: 'Broad' },
] as const;
