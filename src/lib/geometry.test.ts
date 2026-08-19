import { describe, expect, it } from 'vitest';
import {
  align,
  boundingBox,
  clampZoom,
  distribute,
  findFreePosition,
  normaliseRect,
  padToScreen,
  rectsIntersect,
  screenToPad,
  snapPoint,
  snapSize,
  snapValue,
  tidy,
  type PositionedRect,
} from '@/lib/geometry';
import { MIN_ITEM_HEIGHT, MIN_ITEM_WIDTH } from '@/types/domain';

const rect = (id: string, x: number, y: number, width = 100, height = 60): PositionedRect => ({
  id,
  x,
  y,
  width,
  height,
});

describe('snapping', () => {
  it('rounds to the nearest grid line', () => {
    expect(snapValue(10)).toBe(0);
    expect(snapValue(13)).toBe(24);
    expect(snapValue(36)).toBe(48);
    expect(snapValue(-13)).toBe(-24);
  });

  it('uses a custom grid size', () => {
    expect(snapValue(17, 10)).toBe(20);
    expect(snapValue(14, 10)).toBe(10);
  });

  it('leaves a point alone when snapping is switched off', () => {
    expect(snapPoint({ x: 13.4, y: 51.6 }, false)).toEqual({ x: 13, y: 52 });
    expect(snapPoint({ x: 13.4, y: 51.6 }, true)).toEqual({ x: 24, y: 48 });
  });

  it('never snaps a note below its minimum size', () => {
    const result = snapSize(10, 10, true);
    expect(result.width).toBe(MIN_ITEM_WIDTH);
    expect(result.height).toBe(MIN_ITEM_HEIGHT);
  });
});

describe('zoom and coordinate conversion', () => {
  it('clamps zoom to the supported range', () => {
    expect(clampZoom(0.1)).toBe(0.4);
    expect(clampZoom(10)).toBe(2.5);
    expect(clampZoom(Number.NaN)).toBe(1);
  });

  it('round-trips between screen and pad space', () => {
    const viewport = { x: 120, y: -40, zoom: 1.5 };
    const point = { x: 37, y: 91 };
    const returned = padToScreen(screenToPad(point, viewport), viewport);
    expect(returned.x).toBeCloseTo(point.x);
    expect(returned.y).toBeCloseTo(point.y);
  });
});

describe('selection geometry', () => {
  it('normalises a marquee drawn in any direction', () => {
    expect(normaliseRect({ x: 100, y: 100 }, { x: 40, y: 30 })).toEqual({
      x: 40,
      y: 30,
      width: 60,
      height: 70,
    });
  });

  it('detects intersection but not mere adjacency', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    expect(rectsIntersect(a, { x: 5, y: 5, width: 10, height: 10 })).toBe(true);
    expect(rectsIntersect(a, { x: 10, y: 0, width: 10, height: 10 })).toBe(false);
  });

  it('computes a bounding box', () => {
    expect(boundingBox([rect('a', 0, 0), rect('b', 200, 100)])).toEqual({
      x: 0,
      y: 0,
      width: 300,
      height: 160,
    });
  });
});

describe('align', () => {
  const rects = [rect('a', 0, 0, 100, 60), rect('b', 50, 200, 200, 40)];

  it('aligns to the left edge of the bounding box', () => {
    expect(align(rects, 'left')).toEqual({ b: { x: 0, y: 200 } });
  });

  it('aligns to the right edge of the bounding box', () => {
    // The box spans x 0..250, so 'a' (width 100) moves to x = 150.
    expect(align(rects, 'right')).toEqual({ a: { x: 150, y: 0 } });
  });

  it('aligns to the top and bottom', () => {
    expect(align(rects, 'top')).toEqual({ b: { x: 50, y: 0 } });
    expect(align(rects, 'bottom')).toEqual({ a: { x: 0, y: 180 } });
  });

  it('does nothing for a single rectangle', () => {
    expect(align([rect('a', 3, 3)], 'left')).toEqual({});
  });
});

describe('distribute', () => {
  it('equalises the gaps and leaves the outer rectangles alone', () => {
    const rects = [
      rect('a', 0, 0, 100, 10),
      rect('b', 110, 0, 100, 10),
      rect('c', 400, 0, 100, 10),
    ];
    const moves = distribute(rects, 'horizontal');
    expect(moves.a).toBeUndefined();
    expect(moves.c).toBeUndefined();
    // Span 0..500, 300 occupied, 200 spare across 2 gaps = 100 each.
    expect(moves.b).toEqual({ x: 200, y: 0 });
  });

  it('needs at least three rectangles', () => {
    expect(distribute([rect('a', 0, 0), rect('b', 50, 0)], 'horizontal')).toEqual({});
  });

  it('distributes vertically', () => {
    const rects = [
      rect('a', 0, 0, 10, 100),
      rect('b', 0, 110, 10, 100),
      rect('c', 0, 400, 10, 100),
    ];
    expect(distribute(rects, 'vertical').b).toEqual({ x: 0, y: 200 });
  });
});

describe('tidy', () => {
  it('lays scattered notes out on the grid from the top-left of their bounds', () => {
    const rects = [
      rect('a', 313, 207, 100, 60),
      rect('b', 41, 19, 100, 60),
      rect('c', 502, 88, 100, 60),
    ];
    const moves = tidy(rects);
    for (const point of Object.values(moves)) {
      expect(point.x % 24).toBe(0);
      expect(point.y % 24).toBe(0);
    }
    // Reading order is preserved: 'b' was highest, so it leads, and the block
    // starts at the snapped top-left of the original bounding box (41, 19).
    expect(moves.b).toEqual({ x: 48, y: 24 });
  });

  it('does nothing for fewer than two notes', () => {
    expect(tidy([rect('a', 5, 5)])).toEqual({});
  });

  it('never overlaps the notes it moves', () => {
    const rects = Array.from({ length: 9 }, (_, index) => rect(`n${index}`, index * 7, index * 3));
    const moves = tidy(rects);
    const placed = rects.map((item) => ({ ...item, ...(moves[item.id] ?? {}) }));
    for (let i = 0; i < placed.length; i += 1) {
      for (let j = i + 1; j < placed.length; j += 1) {
        const a = placed[i];
        const b = placed[j];
        if (!a || !b) continue;
        expect(rectsIntersect(a, b)).toBe(false);
      }
    }
  });
});

describe('findFreePosition', () => {
  it('offsets a new note when the preferred spot is taken', () => {
    const occupied = [{ x: 100, y: 100, width: 200, height: 100 }];
    const result = findFreePosition({ x: 100, y: 100 }, { width: 200, height: 100 }, occupied);
    expect(result).not.toEqual({ x: 100, y: 100 });
  });

  it('uses the preferred spot when it is free', () => {
    expect(findFreePosition({ x: 48, y: 48 }, { width: 100, height: 100 }, [])).toEqual({
      x: 48,
      y: 48,
    });
  });
});
