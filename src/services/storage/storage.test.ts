import { beforeEach, describe, expect, it } from 'vitest';
import { createTestStorage } from '@/test/nodeDatabase';
import { runMigrations } from '@/services/storage/runMigrations';
import { toNumberedPlaceholders } from '@/services/storage/database';
import { createNodeDatabase } from '@/test/nodeDatabase';
import { parseInkPoints, parseItemContent } from '@/services/storage/repositories/mappers';
import { newId } from '@/lib/ids';
import { isoDaysAgo } from '@/lib/time';
import type { Storage } from '@/services/storage';

let storage: Storage;

beforeEach(async () => {
  storage = await createTestStorage();
});

async function makePad() {
  return storage.pads.create({ name: 'Monday' });
}

async function makeNote(padId: string, html = 'Hello') {
  return storage.items.create({
    id: newId(),
    padId,
    itemType: 'text',
    content: { kind: 'text', html: `<p>${html}</p>` },
    x: 0,
    y: 0,
    width: 260,
    height: 160,
    zIndex: 1,
    colour: 'neutral',
    pinned: false,
  });
}

describe('migrations', () => {
  it('creates every table and is safe to run twice', async () => {
    const db = createNodeDatabase();
    expect(await runMigrations(db)).toBe(2);
    expect(await runMigrations(db)).toBe(0);

    const tables = await db.select<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table'",
    );
    const names = tables.map((row) => row.name);
    expect(names).toEqual(expect.arrayContaining(['pads', 'items', 'ink_strokes', 'settings']));
  });

  it('creates the indexes the queries rely on', async () => {
    const indexes = await storage.db.select<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'index'",
    );
    const names = indexes.map((row) => row.name);
    expect(names).toEqual(
      expect.arrayContaining(['idx_items_pad_live', 'idx_pads_updated_at', 'idx_ink_pad_id']),
    );
  });
});

describe('placeholder rewriting', () => {
  it('converts question marks into numbered parameters', () => {
    expect(toNumberedPlaceholders('SELECT * FROM x WHERE a = ? AND b = ?')).toBe(
      'SELECT * FROM x WHERE a = $1 AND b = $2',
    );
  });

  it('leaves statements without parameters untouched', () => {
    expect(toNumberedPlaceholders('DELETE FROM items')).toBe('DELETE FROM items');
  });
});

describe('pad repository', () => {
  it('uses a UUID rather than a sequential identifier', async () => {
    const pad = await makePad();
    expect(pad.id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('allows a pad to have no name', async () => {
    const pad = await storage.pads.create({});
    expect(pad.name).toBeNull();
    expect((await storage.pads.get(pad.id))?.name).toBeNull();
  });

  it('round-trips preferences and the viewport', async () => {
    const pad = await storage.pads.create({ gridType: 'lines', snapEnabled: false, zoom: 1.5 });
    await storage.pads.update(pad.id, { viewportX: -120, viewportY: 64 });

    const loaded = await storage.pads.get(pad.id);
    expect(loaded).toMatchObject({
      gridType: 'lines',
      snapEnabled: false,
      zoom: 1.5,
      viewportX: -120,
      viewportY: 64,
    });
  });

  it('hides archived and deleted pads from the default listing', async () => {
    const kept = await makePad();
    const archived = await makePad();
    const deleted = await makePad();
    await storage.pads.archive(archived.id);
    await storage.pads.softDelete(deleted.id);

    expect((await storage.pads.list()).map((pad) => pad.id)).toEqual([kept.id]);
    expect(await storage.pads.list({ includeArchived: true, includeDeleted: true })).toHaveLength(
      3,
    );
  });

  it('restores an archived or deleted pad', async () => {
    const pad = await makePad();
    await storage.pads.softDelete(pad.id);
    await storage.pads.restore(pad.id);

    const loaded = await storage.pads.get(pad.id);
    expect(loaded?.deletedAt).toBeNull();
    expect(loaded?.archivedAt).toBeNull();
  });

  it('purging a pad removes its notes and ink', async () => {
    const pad = await makePad();
    await makeNote(pad.id);
    await storage.ink.create({ id: newId(), padId: pad.id, colour: '#000', width: 2, points: [] });

    await storage.pads.purge(pad.id);
    expect(await storage.items.count()).toBe(0);
    expect(await storage.ink.count()).toBe(0);
  });
});

describe('item repository', () => {
  it('stores and reloads structured content', async () => {
    const pad = await makePad();
    const created = await storage.items.create({
      id: newId(),
      padId: pad.id,
      itemType: 'checklist',
      content: {
        kind: 'checklist',
        title: 'Shopping',
        entries: [{ id: 'e1', text: 'Milk', done: true }],
      },
      x: 24,
      y: 48,
      width: 260,
      height: 160,
      zIndex: 3,
      colour: 'sand',
      pinned: true,
    });

    const loaded = await storage.items.get(created.id);
    expect(loaded).toMatchObject({ colour: 'sand', pinned: true, zIndex: 3, x: 24, y: 48 });
    expect(loaded?.content).toEqual({
      kind: 'checklist',
      title: 'Shopping',
      entries: [{ id: 'e1', text: 'Milk', done: true }],
    });
  });

  it('sanitises stored HTML on the way back out', async () => {
    const pad = await makePad();
    const item = await storage.items.create({
      id: newId(),
      padId: pad.id,
      itemType: 'text',
      content: { kind: 'text', html: '<p onclick="x()">Hi</p><script>bad()</script>' },
      x: 0,
      y: 0,
      width: 260,
      height: 160,
      zIndex: 0,
      colour: 'neutral',
      pinned: false,
    });

    const loaded = await storage.items.get(item.id);
    expect(loaded?.content).toEqual({ kind: 'text', html: '<p>Hi</p>' });
  });

  it('applies a partial update without disturbing other fields', async () => {
    const pad = await makePad();
    const note = await makeNote(pad.id);
    await storage.items.update(note.id, { x: 96, colour: 'sage' });

    const loaded = await storage.items.get(note.id);
    expect(loaded).toMatchObject({ x: 96, colour: 'sage', width: 260 });
  });

  it('updates many notes at once', async () => {
    const pad = await makePad();
    const a = await makeNote(pad.id);
    const b = await makeNote(pad.id);
    await storage.items.updateMany([
      { id: a.id, patch: { x: 10 } },
      { id: b.id, patch: { x: 20 } },
    ]);

    expect((await storage.items.get(a.id))?.x).toBe(10);
    expect((await storage.items.get(b.id))?.x).toBe(20);
  });

  it('soft-deletes, lists and restores notes', async () => {
    const pad = await makePad();
    const note = await makeNote(pad.id);

    await storage.items.softDelete([note.id]);
    expect(await storage.items.listByPad(pad.id)).toHaveLength(0);
    expect(await storage.items.listDeleted()).toHaveLength(1);

    await storage.items.restore([note.id]);
    expect(await storage.items.listByPad(pad.id)).toHaveLength(1);
    expect(await storage.items.listDeleted()).toHaveLength(0);
  });

  it('honours the retention cut-off when purging', async () => {
    const pad = await makePad();
    const old = await makeNote(pad.id);
    const recent = await makeNote(pad.id);

    await storage.items.update(old.id, { deletedAt: isoDaysAgo(90) });
    await storage.items.softDelete([recent.id]);

    expect(await storage.items.purgeDeletedBefore(isoDaysAgo(30))).toBe(1);
    expect(await storage.items.get(old.id)).toBeNull();
    expect(await storage.items.get(recent.id)).not.toBeNull();
  });

  it('reports the highest z-index on a pad', async () => {
    const pad = await makePad();
    await makeNote(pad.id);
    await storage.items.update((await makeNote(pad.id)).id, { zIndex: 42 });
    expect(await storage.items.maxZIndex(pad.id)).toBe(42);
  });

  it('removes a pad’s notes through the foreign key when the pad is purged', async () => {
    const pad = await makePad();
    await makeNote(pad.id);
    await storage.pads.purge(pad.id);
    expect(await storage.items.listAll({ includeDeleted: true })).toHaveLength(0);
  });

  it('defaults project and bundleId to null, and round-trips them once set', async () => {
    const pad = await makePad();
    const note = await makeNote(pad.id);
    expect(note.project).toBeNull();
    expect(note.bundleId).toBeNull();

    const bundleId = newId();
    await storage.items.update(note.id, { project: 'Operation Falcon', bundleId });
    const loaded = await storage.items.get(note.id);
    expect(loaded?.project).toBe('Operation Falcon');
    expect(loaded?.bundleId).toBe(bundleId);
  });
});

describe('ink repository', () => {
  it('stores strokes as vector data, not as an image', async () => {
    const pad = await makePad();
    const points = [
      { x: 1, y: 2, pressure: 0.4 },
      { x: 3, y: 4, pressure: 0.8 },
    ];
    const stroke = await storage.ink.create({
      id: newId(),
      padId: pad.id,
      colour: 'var(--sb-ink-2)',
      width: 3,
      points,
    });

    const [loaded] = await storage.ink.listByPad(pad.id);
    expect(loaded?.id).toBe(stroke.id);
    expect(loaded?.points).toEqual(points);
  });

  it('erasing is reversible', async () => {
    const pad = await makePad();
    const stroke = await storage.ink.create({
      id: newId(),
      padId: pad.id,
      colour: '#000',
      width: 2,
      points: [{ x: 0, y: 0, pressure: 0.5 }],
    });

    await storage.ink.softDelete([stroke.id]);
    expect(await storage.ink.listByPad(pad.id)).toHaveLength(0);

    await storage.ink.restore([stroke.id]);
    expect(await storage.ink.listByPad(pad.id)).toHaveLength(1);
  });

  it('updates a stroke’s colour, width and points in place', async () => {
    const pad = await makePad();
    const stroke = await storage.ink.create({
      id: newId(),
      padId: pad.id,
      colour: '#000',
      width: 2,
      points: [{ x: 0, y: 0, pressure: 0.5 }],
    });

    const moved = [{ x: 10, y: 12, pressure: 0.6 }];
    await storage.ink.update(stroke.id, { colour: '#fff', width: 5, points: moved });

    const [loaded] = await storage.ink.listByPad(pad.id);
    expect(loaded).toMatchObject({ colour: '#fff', width: 5, points: moved });
  });
});

describe('settings repository', () => {
  it('inserts and then updates the same key', async () => {
    await storage.settings.set('theme', 'dark');
    await storage.settings.set('theme', 'light');
    expect(await storage.settings.get('theme')).toBe('light');
    expect(await storage.settings.all()).toHaveLength(1);
  });

  it('returns null for an unknown key', async () => {
    expect(await storage.settings.get('missing')).toBeNull();
  });
});

describe('defensive mapping', () => {
  it('degrades malformed content to an empty note rather than throwing', () => {
    expect(parseItemContent('text', 'not json')).toEqual({ kind: 'text', html: '' });
    expect(parseItemContent('checklist', '{"entries":"nope"}')).toEqual({
      kind: 'checklist',
      title: '',
      entries: [],
    });
  });

  it('clamps stroke pressure into range', () => {
    const points = parseInkPoints('[{"x":1,"y":1,"pressure":9},{"x":2,"y":2,"pressure":-4}]');
    expect(points.map((point) => point.pressure)).toEqual([1, 0]);
  });
});
