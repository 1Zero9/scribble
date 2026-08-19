import { unzipSync, zipSync } from 'fflate';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildExport, importBundle, readBundleManifest } from '@/services/exportImport/bundle';
import { padToMarkdown, padMarkdownFileName } from '@/services/exportImport/markdown';
import { scribbleExportSchema } from '@/services/exportImport/schema';
import { createTestStorage } from '@/test/nodeDatabase';
import { newId } from '@/lib/ids';
import type { Storage } from '@/services/storage';
import type { Pad } from '@/types/domain';

let storage: Storage;

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const encode = (text: string) => new TextEncoder().encode(text);

async function seed(): Promise<Pad> {
  const pad = await storage.pads.create({ name: 'Tuesday' });
  await storage.items.create({
    id: newId(),
    padId: pad.id,
    itemType: 'text',
    content: { kind: 'text', html: '<p>Call the supplier</p>' },
    x: 24,
    y: 48,
    width: 260,
    height: 160,
    zIndex: 1,
    colour: 'sand',
    pinned: false,
  });
  await storage.items.create({
    id: newId(),
    padId: pad.id,
    itemType: 'checklist',
    content: {
      kind: 'checklist',
      title: 'Before the meeting',
      entries: [
        { id: 'a', text: 'Print the agenda', done: true },
        { id: 'b', text: 'Book the room', done: false },
      ],
    },
    x: 300,
    y: 48,
    width: 260,
    height: 160,
    zIndex: 2,
    colour: 'sage',
    pinned: false,
  });
  await storage.ink.create({
    id: newId(),
    padId: pad.id,
    colour: 'var(--sb-ink-1)',
    width: 3,
    points: [
      { x: 0, y: 0, pressure: 0.5 },
      { x: 10, y: 12, pressure: 0.7 },
    ],
  });
  return pad;
}

beforeEach(async () => {
  storage = await createTestStorage();
});

describe('export', () => {
  it('produces an open bundle with a manifest, JSON, Markdown and a readme', async () => {
    await seed();
    const bundle = await buildExport(storage);
    const archive = unzipSync(bundle.bytes);
    const names = Object.keys(archive);

    expect(names).toContain('manifest.json');
    expect(names).toContain('data/scribble.json');
    expect(names).toContain('README.txt');
    expect(names.some((name) => name.startsWith('markdown/'))).toBe(true);
  });

  it('writes a manifest with accurate counts', async () => {
    await seed();
    const bundle = await buildExport(storage);
    expect(bundle.manifest.counts).toMatchObject({ pads: 1, items: 2, ink: 1 });
    expect(readBundleManifest(bundle.bytes)?.format).toBe('scribble.export');
  });

  it('validates against its own published schema', async () => {
    await seed();
    const bundle = await buildExport(storage);
    const archive = unzipSync(bundle.bytes);
    const data = JSON.parse(decode(archive['data/scribble.json'] as Uint8Array));
    expect(scribbleExportSchema.safeParse(data).success).toBe(true);
  });

  it('can export a single pad', async () => {
    const first = await seed();
    await storage.pads.create({ name: 'Other' });

    const bundle = await buildExport(storage, { padId: first.id });
    expect(bundle.manifest.counts.pads).toBe(1);
    expect(bundle.fileName).toContain('scribble-pad-');

    const archive = unzipSync(bundle.bytes);
    const data = JSON.parse(decode(archive['data/scribble.json'] as Uint8Array));
    expect(data.scope).toBe('pad');
  });

  it('renders Markdown without the ambient date and clock', async () => {
    const pad = await seed();
    const items = await storage.items.listByPad(pad.id);
    const ink = await storage.ink.listByPad(pad.id);
    const markdown = padToMarkdown(pad, items, ink, '2026-08-18T09:00:00.000Z');

    expect(markdown).toContain('# Tuesday');
    expect(markdown).toContain('- [x] Print the agenda');
    expect(markdown).toContain('- [ ] Book the room');
    expect(markdown).toContain('1 pen stroke');
  });

  it('names Markdown files safely', async () => {
    const pad = await storage.pads.create({ name: '../../Weird / Name!' });
    expect(padMarkdownFileName(pad)).toMatch(/^markdown\/[a-z0-9-]+\.md$/);
  });
});

describe('import', () => {
  it('round-trips a bundle', async () => {
    await seed();
    const bundle = await buildExport(storage);

    const fresh = await createTestStorage();
    const summary = await importBundle(fresh, bundle.bytes);

    expect(summary).toMatchObject({ pads: 1, items: 2, ink: 1 });
    const [pad] = await fresh.pads.list();
    expect(pad?.name).toBe('Tuesday');
    expect(await fresh.items.listByPad(pad?.id ?? '')).toHaveLength(2);
  });

  it('never overwrites existing material', async () => {
    await seed();
    const bundle = await buildExport(storage);

    await importBundle(storage, bundle.bytes);
    expect(await storage.pads.count()).toBe(2);

    const pads = await storage.pads.list();
    expect(new Set(pads.map((pad) => pad.id)).size).toBe(2);
  });

  it('rejects a file that is not a zip', async () => {
    await expect(importBundle(storage, encode('definitely not a zip'))).rejects.toThrow(
      /not a Scribble export bundle/i,
    );
  });

  it('rejects a zip without Scribble data', async () => {
    const bytes = zipSync({ 'notes.txt': encode('hello') });
    await expect(importBundle(storage, bytes)).rejects.toThrow(
      /does not contain any Scribble data/i,
    );
  });

  it('rejects data that fails schema validation and writes nothing', async () => {
    const bytes = zipSync({
      'data/scribble.json': encode(JSON.stringify({ format: 'scribble.export', version: 99 })),
    });
    await expect(importBundle(storage, bytes)).rejects.toThrow(/not a valid Scribble export/i);
    expect(await storage.pads.count()).toBe(0);
  });

  it('rejects an item whose colour or type is not recognised', async () => {
    await seed();
    const bundle = await buildExport(storage);
    const archive = unzipSync(bundle.bytes);
    const data = JSON.parse(decode(archive['data/scribble.json'] as Uint8Array));
    data.items[0].itemType = 'executable';

    const tampered = zipSync({ 'data/scribble.json': encode(JSON.stringify(data)) });
    await expect(importBundle(await createTestStorage(), tampered)).rejects.toThrow();
  });

  it('sanitises note HTML that arrives in a bundle', async () => {
    await seed();
    const bundle = await buildExport(storage);
    const archive = unzipSync(bundle.bytes);
    const data = JSON.parse(decode(archive['data/scribble.json'] as Uint8Array));
    data.items[0].content = { kind: 'text', html: '<p>Hi</p><script>bad()</script>' };

    const tampered = zipSync({ 'data/scribble.json': encode(JSON.stringify(data)) });
    const fresh = await createTestStorage();
    await importBundle(fresh, tampered);

    const items = await fresh.items.listAll();
    const text = items.find((item) => item.itemType === 'text');
    expect(JSON.stringify(text?.content)).not.toContain('script');
  });
});
