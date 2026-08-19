import { describe, expect, it, vi } from 'vitest';
import { createAutosaveQueue } from '@/store/autosave';
import {
  effectiveWidth,
  simplify,
  strokeBounds,
  strokeHitTest,
  strokeToPath,
} from '@/features/ink/inkGeometry';
import { search, searchItems, padDisplayName } from '@/services/search/search';
import { decodeSettings, DEFAULT_SETTINGS } from '@/services/settings/settings';
import { isUuid, newId } from '@/lib/ids';
import { formatRelative, isWithinDateFilter } from '@/lib/time';
import type { Item, Pad } from '@/types/domain';

describe('autosave queue', () => {
  it('merges patches for the same note into one write', async () => {
    vi.useFakeTimers();
    const flush = vi.fn().mockResolvedValue(undefined);
    const queue = createAutosaveQueue(flush, 100);

    queue.enqueue('a', { x: 1 });
    queue.enqueue('a', { y: 2 });
    queue.enqueue('b', { x: 5 });
    expect(flush).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(150);
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush.mock.calls[0]?.[0]).toEqual([
      { id: 'a', patch: { x: 1, y: 2 } },
      { id: 'b', patch: { x: 5 } },
    ]);
    vi.useRealTimers();
  });

  it('flushes on demand so nothing is lost when the window hides', async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    const queue = createAutosaveQueue(flush, 10_000);

    queue.enqueue('a', { x: 1 });
    expect(queue.pendingCount()).toBe(1);
    await queue.flush();

    expect(flush).toHaveBeenCalledTimes(1);
    expect(queue.pendingCount()).toBe(0);
  });

  it('does nothing when there is nothing pending', async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    await createAutosaveQueue(flush).flush();
    expect(flush).not.toHaveBeenCalled();
  });
});

describe('ink geometry', () => {
  const points = [
    { x: 0, y: 0, pressure: 0.5 },
    { x: 10, y: 0, pressure: 0.5 },
    { x: 20, y: 0, pressure: 0.5 },
  ];

  it('builds a path that starts at the first point', () => {
    expect(strokeToPath(points)).toMatch(/^M 0 0/);
    expect(strokeToPath([])).toBe('');
  });

  it('scales width with average pressure', () => {
    const light = effectiveWidth({
      width: 4,
      points: points.map((p) => ({ ...p, pressure: 0.1 })),
    });
    const heavy = effectiveWidth({ width: 4, points: points.map((p) => ({ ...p, pressure: 1 })) });
    expect(heavy).toBeGreaterThan(light);
  });

  it('removes redundant points but keeps the ends', () => {
    const dense = Array.from({ length: 50 }, (_, index) => ({
      x: index * 0.1,
      y: 0,
      pressure: 0.5,
    }));
    const result = simplify(dense);
    expect(result.length).toBeLessThan(dense.length);
    expect(result[0]).toEqual(dense[0]);
    expect(result[result.length - 1]).toEqual(dense[dense.length - 1]);
  });

  it('hit-tests against the stroke, not just its points', () => {
    const stroke = { points, width: 2 };
    expect(strokeHitTest(stroke, { x: 5, y: 1 })).toBe(true);
    expect(strokeHitTest(stroke, { x: 5, y: 60 })).toBe(false);
  });

  it('computes bounds that include the stroke width', () => {
    expect(strokeBounds({ points, width: 4 })).toEqual({ x: -4, y: -4, width: 28, height: 8 });
  });
});

describe('identifiers', () => {
  it('generates version 4 UUIDs', () => {
    const id = newId();
    expect(isUuid(id)).toBe(true);
    expect(newId()).not.toBe(id);
  });

  it('rejects anything that is not a UUID', () => {
    expect(isUuid('1')).toBe(false);
    expect(isUuid(42)).toBe(false);
  });
});

describe('time helpers', () => {
  const reference = new Date('2026-08-18T12:00:00.000Z');

  it('describes recent times in plain English', () => {
    expect(formatRelative('2026-08-18T11:59:50.000Z', reference)).toBe('Just now');
    expect(formatRelative('2026-08-18T11:30:00.000Z', reference)).toBe('30 minutes ago');
    expect(formatRelative('2026-08-17T12:00:00.000Z', reference)).toBe('Yesterday');
  });

  it('filters by date window', () => {
    expect(isWithinDateFilter('2026-08-18T09:00:00.000Z', 'today', reference)).toBe(true);
    expect(isWithinDateFilter('2026-08-01T09:00:00.000Z', 'today', reference)).toBe(false);
    expect(isWithinDateFilter('2020-01-01T00:00:00.000Z', 'any', reference)).toBe(true);
  });
});

function makeItem(id: string, text: string, updatedAt = '2026-08-18T09:00:00.000Z'): Item {
  return {
    id,
    padId: 'pad-1',
    itemType: 'text',
    content: { kind: 'text', html: `<p>${text}</p>` },
    x: 0,
    y: 0,
    width: 260,
    height: 160,
    zIndex: 0,
    colour: 'neutral',
    pinned: false,
    createdAt: updatedAt,
    updatedAt,
    archivedAt: null,
    deletedAt: null,
  };
}

const pad: Pad = {
  id: 'pad-1',
  name: 'Project Falcon',
  background: 'paper',
  gridType: 'dots',
  snapEnabled: true,
  zoom: 1,
  viewportX: 0,
  viewportY: 0,
  createdAt: '2026-08-01T09:00:00.000Z',
  updatedAt: '2026-08-18T09:00:00.000Z',
  archivedAt: null,
  deletedAt: null,
};

describe('search', () => {
  const items = [
    makeItem('1', 'Order new keyboards for the team'),
    makeItem('2', 'Keyboard shortcuts need documenting'),
    makeItem('3', 'Unrelated thought about lunch'),
  ];

  it('returns nothing for an empty query', () => {
    expect(search(items, [pad], '   ')).toEqual([]);
  });

  it('matches notes and pads', () => {
    const results = search(items, [pad], 'keyboard');
    expect(results.filter((result) => result.kind === 'item')).toHaveLength(2);
    expect(search(items, [pad], 'falcon').some((result) => result.kind === 'pad')).toBe(true);
  });

  it('requires every token to match', () => {
    expect(searchItems(items, [pad], 'keyboard lunch')).toHaveLength(0);
  });

  it('excludes deleted notes unless asked', () => {
    const deleted = { ...makeItem('4', 'keyboard tray'), deletedAt: '2026-08-18T10:00:00.000Z' };
    const pool = [...items, deleted];
    expect(searchItems(pool, [pad], 'keyboard')).toHaveLength(2);
    expect(
      searchItems(pool, [pad], 'keyboard', {
        types: [],
        date: 'any',
        includeArchived: true,
        includeDeleted: true,
      }),
    ).toHaveLength(3);
  });

  it('falls back to a display name for an unnamed pad', () => {
    expect(padDisplayName({ ...pad, name: null })).toBe('Untitled Pad');
    expect(padDisplayName({ ...pad, name: '   ' })).toBe('Untitled Pad');
  });
});

describe('settings decoding', () => {
  it('falls back to defaults for missing or invalid values', () => {
    const settings = decodeSettings([
      { key: 'theme', value: 'neon' },
      { key: 'retentionDays', value: '9999' },
      { key: 'snapEnabled', value: 'false' },
    ]);

    expect(settings.theme).toBe(DEFAULT_SETTINGS.theme);
    expect(settings.retentionDays).toBe(DEFAULT_SETTINGS.retentionDays);
    expect(settings.snapEnabled).toBe(false);
  });

  it('always excludes the date and clock from exports', () => {
    expect(decodeSettings([{ key: 'showDateInExports', value: 'true' }]).showDateInExports).toBe(
      false,
    );
  });
});
