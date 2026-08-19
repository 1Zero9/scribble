import { create } from 'zustand';
import {
  DEFAULT_ITEM_HEIGHT,
  DEFAULT_ITEM_WIDTH,
  type InkStroke,
  type Item,
  type ItemContent,
  type ItemType,
  type NoteColour,
  type Pad,
  type Point,
  type Uuid,
  type Viewport,
} from '@/types/domain';
import { newId } from '@/lib/ids';
import { isoDaysAgo, now } from '@/lib/time';
import { clampZoom, findFreePosition, snapPoint } from '@/lib/geometry';
import { openStorage, type ItemPatch, type Storage } from '@/services/storage';
import { LAST_PAD_KEY } from '@/services/settings/settings';
import { createLogger, describeError } from '@/services/logging/logger';
import { useUiStore } from './uiStore';
import { useSettingsStore } from './settingsStore';
import { createAutosaveQueue } from './autosave';

const log = createLogger('desk');

export interface DrawerData {
  pads: Pad[];
  deletedItems: Item[];
  archivedItems: Item[];
  recentItems: Item[];
}

interface DeskState {
  status: 'loading' | 'ready' | 'error';
  error: string | null;

  pads: Pad[];
  activePadId: Uuid | null;
  items: Item[];
  ink: InkStroke[];
  viewport: Viewport;

  selection: Uuid[];
  editingItemId: Uuid | null;
  selectedStrokeId: Uuid | null;

  drawer: DrawerData;

  /** Ink history for the current session, kept in memory only. */
  inkUndo: InkStroke[][];
  inkRedo: InkStroke[][];

  initialise: () => Promise<void>;
  openPad: (id: Uuid) => Promise<void>;
  createPad: (name?: string | null) => Promise<Pad | null>;
  duplicatePad: (id: Uuid) => Promise<void>;
  renamePad: (id: Uuid, name: string | null) => Promise<void>;
  archivePad: (id: Uuid) => Promise<void>;
  deletePad: (id: Uuid) => Promise<void>;
  restorePad: (id: Uuid) => Promise<void>;
  purgePad: (id: Uuid) => Promise<void>;
  updatePadPreferences: (
    patch: Partial<Pick<Pad, 'gridType' | 'snapEnabled' | 'background'>>,
  ) => Promise<void>;

  createItem: (
    itemType: ItemType,
    content: ItemContent,
    at: Point,
    options?: { width?: number; height?: number; colour?: NoteColour; focus?: boolean },
  ) => Promise<Item | null>;
  updateItem: (id: Uuid, patch: ItemPatch, immediate?: boolean) => void;
  updateItems: (patches: ReadonlyArray<{ id: Uuid; patch: ItemPatch }>) => Promise<void>;
  duplicateItems: (ids: readonly Uuid[]) => Promise<void>;
  deleteItems: (ids: readonly Uuid[]) => Promise<void>;
  archiveItems: (ids: readonly Uuid[]) => Promise<void>;
  restoreItems: (ids: readonly Uuid[]) => Promise<void>;
  purgeItems: (ids: readonly Uuid[]) => Promise<void>;
  flush: () => Promise<void>;

  /** Joins two notes into a collapsed stack, or adds one to an existing stack. */
  bundleItems: (draggedId: Uuid, targetId: Uuid) => Promise<void>;
  /** Fans a collapsed stack's notes back out into individually placed cards. */
  expandBundle: (bundleId: Uuid) => Promise<void>;

  setSelection: (ids: readonly Uuid[]) => void;
  toggleSelection: (id: Uuid) => void;
  clearSelection: () => void;
  setEditingItem: (id: Uuid | null) => void;
  selectStroke: (id: Uuid | null) => void;
  bringToFront: (id: Uuid) => void;

  setViewport: (viewport: Viewport) => void;
  resetViewport: () => void;

  addInkStroke: (stroke: Omit<InkStroke, 'createdAt' | 'updatedAt' | 'deletedAt'>) => Promise<void>;
  updateInkStroke: (
    id: Uuid,
    patch: Partial<Pick<InkStroke, 'colour' | 'width' | 'points'>>,
  ) => void;
  eraseInk: (ids: readonly Uuid[]) => Promise<void>;
  undoInk: () => Promise<void>;
  redoInk: () => Promise<void>;

  refreshDrawer: () => Promise<void>;
  reloadAll: () => Promise<void>;
}

let storagePromise: Promise<Storage> | null = null;
function storage(): Promise<Storage> {
  storagePromise ??= openStorage();
  return storagePromise;
}

/** The single in-flight start-up, shared by every caller of `initialise`. */
let startup: Promise<void> | null = null;

/** Replaces the shared storage handle. Used by tests and after data deletion. */
export function setStorageForTesting(next: Promise<Storage> | null): void {
  storagePromise = next;
}

export const useDeskStore = create<DeskState>((set, get) => {
  const autosave = createAutosaveQueue(async (batch) => {
    try {
      const store = await storage();
      await store.items.updateMany(batch);
    } catch (error) {
      log.error('autosave.failed');
      useUiStore.getState().notify(describeError(error, 'Changes could not be saved.'), 'error');
    }
  });

  const viewportSave = (() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    return (padId: Uuid, viewport: Viewport) => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        void storage()
          .then((store) =>
            store.pads.update(padId, {
              zoom: viewport.zoom,
              viewportX: viewport.x,
              viewportY: viewport.y,
            }),
          )
          .catch(() => log.warn('viewport.save.failed'));
      }, 500);
    };
  })();

  async function loadPad(padId: Uuid): Promise<void> {
    const store = await storage();
    const pad = await store.pads.get(padId);
    if (!pad) throw new Error('That pad could not be found.');

    const [items, ink] = await Promise.all([
      store.items.listByPad(pad.id),
      store.ink.listByPad(pad.id),
    ]);

    set({
      activePadId: pad.id,
      items,
      ink,
      viewport: { x: pad.viewportX, y: pad.viewportY, zoom: clampZoom(pad.zoom) },
      selection: [],
      editingItemId: null,
      selectedStrokeId: null,
      inkUndo: [],
      inkRedo: [],
    });
    await store.settings.set(LAST_PAD_KEY, pad.id);
  }

  function activePad(): Pad | undefined {
    const { pads, activePadId } = get();
    return pads.find((pad) => pad.id === activePadId);
  }

  /** Leaves the deskpad with no pad open, rather than conjuring a blank replacement. */
  function clearActivePad(): void {
    set({
      activePadId: null,
      items: [],
      ink: [],
      selection: [],
      editingItemId: null,
      selectedStrokeId: null,
      inkUndo: [],
      inkRedo: [],
    });
  }

  return {
    status: 'loading',
    error: null,
    pads: [],
    activePadId: null,
    items: [],
    ink: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    selection: [],
    editingItemId: null,
    selectedStrokeId: null,
    drawer: { pads: [], deletedItems: [], archivedItems: [], recentItems: [] },
    inkUndo: [],
    inkRedo: [],

    async initialise() {
      // React runs effects twice in development, and the window may be shown
      // again before start-up has settled. Sharing one in-flight promise stops a
      // second call racing the first and creating a duplicate starter pad.
      startup ??= (async () => {
        try {
          set({ status: 'loading', error: null });
          const store = await storage();

          // Enforce the retention setting before anything is shown.
          const settings = useSettingsStore.getState().settings;
          const cutoff = isoDaysAgo(settings.retentionDays);
          await store.items.purgeDeletedBefore(cutoff);
          await store.ink.purgeDeletedBefore(cutoff);
          await store.pads.purgeDeletedBefore(cutoff);

          let pads = await store.pads.list();
          if (pads.length === 0) {
            await store.pads.create({ name: null });
            pads = await store.pads.list();
          }

          const remembered = await store.settings.get(LAST_PAD_KEY);
          const target = pads.find((pad) => pad.id === remembered) ?? pads[0];
          set({ pads });
          if (target) await loadPad(target.id);
          set({ status: 'ready' });
          await get().refreshDrawer();
          log.info('desk.ready', { pads: pads.length });
        } catch (error) {
          log.error('desk.initialise.failed');
          set({
            status: 'error',
            error: describeError(error, 'Scribble could not open your data.'),
          });
          // Allow a retry after a failure.
          startup = null;
        }
      })();

      return startup;
    },

    async openPad(id) {
      await autosave.flush();
      try {
        await loadPad(id);
        const store = await storage();
        set({ pads: await store.pads.list() });
      } catch (error) {
        useUiStore
          .getState()
          .notify(describeError(error, 'That pad could not be opened.'), 'error');
      }
    },

    async createPad(name = null) {
      try {
        const store = await storage();
        const pad = await store.pads.create({ name });
        set({ pads: await store.pads.list() });
        await loadPad(pad.id);
        useUiStore.getState().announce('New pad created.');
        return pad;
      } catch (error) {
        useUiStore
          .getState()
          .notify(describeError(error, 'The pad could not be created.'), 'error');
        return null;
      }
    },

    async duplicatePad(id) {
      const store = await storage();
      const source = await store.pads.get(id);
      if (!source) return;

      const copy = await store.pads.create({
        name: source.name === null ? null : `${source.name} (copy)`,
        background: source.background,
        gridType: source.gridType,
        snapEnabled: source.snapEnabled,
        zoom: source.zoom,
        viewportX: source.viewportX,
        viewportY: source.viewportY,
      });

      const items = await store.items.listByPad(id, { includeArchived: true });
      await store.items.createMany(items.map((item) => ({ ...item, id: newId(), padId: copy.id })));

      const strokes = await store.ink.listByPad(id);
      for (const stroke of strokes) {
        await store.ink.create({ ...stroke, id: newId(), padId: copy.id });
      }

      set({ pads: await store.pads.list() });
      await loadPad(copy.id);
      useUiStore.getState().announce('Pad duplicated.');
      await get().refreshDrawer();
    },

    async renamePad(id, name) {
      const store = await storage();
      await store.pads.update(id, { name: name?.trim() === '' ? null : name });
      set({ pads: await store.pads.list() });
      await get().refreshDrawer();
    },

    async archivePad(id) {
      const store = await storage();
      await store.pads.archive(id);
      const pads = await store.pads.list();
      set({ pads });
      if (get().activePadId === id) {
        if (pads[0]) await loadPad(pads[0].id);
        else clearActivePad();
      }
      useUiStore.getState().announce('Pad archived. You can restore it from the Drawer.');
      await get().refreshDrawer();
    },

    async deletePad(id) {
      const store = await storage();
      await store.pads.softDelete(id);
      const pads = await store.pads.list();
      set({ pads });
      if (get().activePadId === id) {
        if (pads[0]) await loadPad(pads[0].id);
        else clearActivePad();
      }
      useUiStore.getState().notify('Pad moved to recently deleted.', 'info', {
        label: 'Undo',
        run: () => void get().restorePad(id),
      });
      await get().refreshDrawer();
    },

    async restorePad(id) {
      const store = await storage();
      await store.pads.restore(id);
      set({ pads: await store.pads.list() });
      useUiStore.getState().announce('Pad restored.');
      await get().refreshDrawer();
    },

    async purgePad(id) {
      const store = await storage();
      await store.pads.purge(id);
      set({ pads: await store.pads.list() });
      useUiStore.getState().announce('Pad permanently deleted.');
      await get().refreshDrawer();
    },

    async updatePadPreferences(patch) {
      const padId = get().activePadId;
      if (padId === null) return;
      const store = await storage();
      await store.pads.update(padId, patch);
      set({ pads: await store.pads.list() });
    },

    async createItem(itemType, content, at, options = {}) {
      const padId = get().activePadId;
      if (padId === null) return null;

      try {
        const store = await storage();
        const pad = activePad();
        const snapEnabled = pad?.snapEnabled ?? true;
        const width = options.width ?? DEFAULT_ITEM_WIDTH;
        const height = options.height ?? DEFAULT_ITEM_HEIGHT;

        const snapped = snapPoint(at, snapEnabled);
        const position = findFreePosition(snapped, { width, height }, get().items);
        const zIndex = (await store.items.maxZIndex(padId)) + 1;

        const item = await store.items.create({
          id: newId(),
          padId,
          itemType,
          content,
          x: position.x,
          y: position.y,
          width,
          height,
          zIndex,
          colour: options.colour ?? 'neutral',
          pinned: false,
        });

        set((state) => ({
          items: [...state.items, item],
          selection: [item.id],
          editingItemId: options.focus === false ? null : item.id,
        }));

        useUiStore.getState().announce(`${labelFor(itemType)} created.`);
        return item;
      } catch (error) {
        log.error('item.create.failed');
        useUiStore
          .getState()
          .notify(describeError(error, 'The note could not be created.'), 'error');
        return null;
      }
    },

    updateItem(id, patch, immediate = false) {
      const timestamp = now();
      set((state) => ({
        items: state.items.map((item) =>
          item.id === id ? ({ ...item, ...patch, updatedAt: timestamp } as Item) : item,
        ),
      }));

      if (immediate) {
        void storage()
          .then((store) => store.items.update(id, patch))
          .catch(() => log.error('item.update.failed'));
      } else {
        autosave.enqueue(id, patch);
      }
    },

    async updateItems(patches) {
      if (patches.length === 0) return;
      const timestamp = now();
      const map = new Map(patches.map(({ id, patch }) => [id, patch]));
      set((state) => ({
        items: state.items.map((item) => {
          const patch = map.get(item.id);
          return patch ? ({ ...item, ...patch, updatedAt: timestamp } as Item) : item;
        }),
      }));
      const store = await storage();
      await store.items.updateMany(patches);
    },

    async duplicateItems(ids) {
      const padId = get().activePadId;
      if (padId === null || ids.length === 0) return;

      const store = await storage();
      const originals = get().items.filter((item) => ids.includes(item.id));
      let zIndex = (await store.items.maxZIndex(padId)) + 1;

      const copies = originals.map((item) => ({
        ...item,
        id: newId(),
        x: item.x + 24,
        y: item.y + 24,
        zIndex: zIndex++,
        pinned: false,
        bundleId: null,
      }));

      const created = await store.items.createMany(copies);
      set((state) => ({
        items: [...state.items, ...created],
        selection: created.map((i) => i.id),
      }));
      useUiStore.getState().announce(`${created.length} notes duplicated.`);
    },

    async deleteItems(ids) {
      if (ids.length === 0) return;
      await autosave.flush();
      const store = await storage();
      await store.items.softDelete(ids);
      set((state) => ({
        items: state.items.filter((item) => !ids.includes(item.id)),
        selection: state.selection.filter((id) => !ids.includes(id)),
        editingItemId:
          state.editingItemId !== null && ids.includes(state.editingItemId)
            ? null
            : state.editingItemId,
      }));

      useUiStore
        .getState()
        .notify(`${ids.length === 1 ? 'Note' : `${ids.length} notes`} deleted.`, 'info', {
          label: 'Undo',
          run: () => void get().restoreItems(ids),
        });
      useUiStore
        .getState()
        .announce(`${ids.length === 1 ? 'Note' : `${ids.length} notes`} deleted.`);
      await get().refreshDrawer();
    },

    async archiveItems(ids) {
      if (ids.length === 0) return;
      const store = await storage();
      await store.items.archive(ids);
      set((state) => ({
        items: state.items.filter((item) => !ids.includes(item.id)),
        selection: [],
      }));
      useUiStore.getState().announce('Notes moved to the Drawer.');
      await get().refreshDrawer();
    },

    async restoreItems(ids) {
      if (ids.length === 0) return;
      const store = await storage();
      await store.items.restore(ids);
      const padId = get().activePadId;
      if (padId !== null) set({ items: await store.items.listByPad(padId) });
      useUiStore
        .getState()
        .announce(`${ids.length === 1 ? 'Note' : `${ids.length} notes`} restored.`);
      await get().refreshDrawer();
    },

    async purgeItems(ids) {
      if (ids.length === 0) return;
      const store = await storage();
      await store.items.purge(ids);
      useUiStore.getState().announce('Permanently deleted.');
      await get().refreshDrawer();
    },

    async bundleItems(draggedId, targetId) {
      if (draggedId === targetId) return;
      const target = get().items.find((item) => item.id === targetId);
      if (!target) return;
      const groupId = target.bundleId ?? newId();
      const anchor = { x: target.x, y: target.y };

      const store = await storage();
      await store.items.updateMany([
        ...(target.bundleId === groupId ? [] : [{ id: targetId, patch: { bundleId: groupId } }]),
        { id: draggedId, patch: { bundleId: groupId, x: anchor.x, y: anchor.y } },
      ]);
      set((state) => ({
        items: state.items.map((item) => {
          if (item.id === targetId) return { ...item, bundleId: groupId };
          if (item.id === draggedId)
            return { ...item, bundleId: groupId, x: anchor.x, y: anchor.y };
          return item;
        }),
      }));
      useUiStore.getState().announce('Notes bundled into a stack.');
    },

    async expandBundle(bundleId) {
      const members = get().items.filter((item) => item.bundleId === bundleId);
      if (members.length < 2) return;
      const patches = members.map((item, index) => ({
        id: item.id,
        patch: { x: item.x + index * 28, y: item.y + index * 28 },
      }));
      await get().updateItems(patches);
      useUiStore.getState().announce(`${members.length} notes expanded.`);
    },

    flush: () => autosave.flush(),

    setSelection: (ids) =>
      set((state) => ({
        selection: [...ids],
        // A note left editing when the selection moves elsewhere, so it never
        // sits open and unreachable behind whatever is selected next.
        editingItemId:
          state.editingItemId !== null && !ids.includes(state.editingItemId)
            ? null
            : state.editingItemId,
        selectedStrokeId: null,
      })),
    toggleSelection: (id) =>
      set((state) => {
        const selection = state.selection.includes(id)
          ? state.selection.filter((value) => value !== id)
          : [...state.selection, id];
        return {
          selection,
          editingItemId:
            state.editingItemId !== null && !selection.includes(state.editingItemId)
              ? null
              : state.editingItemId,
          selectedStrokeId: null,
        };
      }),
    clearSelection: () => set({ selection: [], editingItemId: null, selectedStrokeId: null }),
    setEditingItem: (id) => set({ editingItemId: id }),
    selectStroke: (id) =>
      set((state) => ({
        selectedStrokeId: id,
        selection: id !== null ? [] : state.selection,
        editingItemId: id !== null ? null : state.editingItemId,
      })),

    bringToFront(id) {
      const highest = get().items.reduce((max, item) => Math.max(max, item.zIndex), 0);
      const item = get().items.find((candidate) => candidate.id === id);
      if (!item || item.zIndex === highest) return;
      get().updateItem(id, { zIndex: highest + 1 });
    },

    setViewport(viewport) {
      const next = { ...viewport, zoom: clampZoom(viewport.zoom) };
      set({ viewport: next });
      const padId = get().activePadId;
      if (padId !== null) viewportSave(padId, next);
    },

    resetViewport() {
      get().setViewport({ x: 0, y: 0, zoom: 1 });
    },

    async addInkStroke(stroke) {
      const store = await storage();
      const created = await store.ink.create(stroke);
      set((state) => ({
        ink: [...state.ink, created],
        inkUndo: [...state.inkUndo, [created]].slice(-50),
        inkRedo: [],
      }));
    },

    updateInkStroke(id, patch) {
      set((state) => ({
        ink: state.ink.map((stroke) => (stroke.id === id ? { ...stroke, ...patch } : stroke)),
      }));
      void storage()
        .then((store) => store.ink.update(id, patch))
        .catch(() => log.error('ink.update.failed'));
    },

    async eraseInk(ids) {
      if (ids.length === 0) return;
      const store = await storage();
      const removed = get().ink.filter((stroke) => ids.includes(stroke.id));
      await store.ink.softDelete(ids);
      set((state) => ({
        ink: state.ink.filter((stroke) => !ids.includes(stroke.id)),
        inkUndo: [...state.inkUndo, removed].slice(-50),
        inkRedo: [],
      }));
    },

    async undoInk() {
      const { inkUndo, ink } = get();
      const last = inkUndo[inkUndo.length - 1];
      if (!last) return;
      const store = await storage();
      const present = new Set(ink.map((stroke) => stroke.id));
      const ids = last.map((stroke) => stroke.id);

      if (ids.every((id) => present.has(id))) {
        await store.ink.softDelete(ids);
        set((state) => ({
          ink: state.ink.filter((stroke) => !ids.includes(stroke.id)),
          inkUndo: state.inkUndo.slice(0, -1),
          inkRedo: [...state.inkRedo, last],
        }));
      } else {
        await store.ink.restore(ids);
        set((state) => ({
          ink: [...state.ink, ...last],
          inkUndo: state.inkUndo.slice(0, -1),
          inkRedo: [...state.inkRedo, last],
        }));
      }
      useUiStore.getState().announce('Ink change undone.');
    },

    async redoInk() {
      const { inkRedo, ink } = get();
      const last = inkRedo[inkRedo.length - 1];
      if (!last) return;
      const store = await storage();
      const present = new Set(ink.map((stroke) => stroke.id));
      const ids = last.map((stroke) => stroke.id);

      if (ids.every((id) => present.has(id))) {
        await store.ink.softDelete(ids);
        set((state) => ({
          ink: state.ink.filter((stroke) => !ids.includes(stroke.id)),
          inkRedo: state.inkRedo.slice(0, -1),
          inkUndo: [...state.inkUndo, last],
        }));
      } else {
        await store.ink.restore(ids);
        set((state) => ({
          ink: [...state.ink, ...last],
          inkRedo: state.inkRedo.slice(0, -1),
          inkUndo: [...state.inkUndo, last],
        }));
      }
      useUiStore.getState().announce('Ink change redone.');
    },

    async refreshDrawer() {
      try {
        const store = await storage();
        const [pads, deletedItems, archivedItems, recentItems] = await Promise.all([
          store.pads.list({ includeArchived: true, includeDeleted: true }),
          store.items.listDeleted(),
          store.items.listArchived(),
          store.items.listAll({ limit: 100 }),
        ]);
        set({ drawer: { pads, deletedItems, archivedItems, recentItems } });
      } catch {
        log.warn('drawer.refresh.failed');
      }
    },

    async reloadAll() {
      storagePromise = null;
      startup = null;
      set({ pads: [], items: [], ink: [], selection: [], activePadId: null });
      await get().initialise();
    },
  };
});

function labelFor(itemType: ItemType): string {
  switch (itemType) {
    case 'checklist':
      return 'Checklist';
    case 'link':
      return 'Link card';
    case 'image':
      return 'Image card';
    case 'file':
      return 'File reference';
    default:
      return 'Note';
  }
}

/** Convenience selector: the pad currently on screen. */
export function selectActivePad(state: DeskState): Pad | null {
  return state.pads.find((pad) => pad.id === state.activePadId) ?? null;
}
