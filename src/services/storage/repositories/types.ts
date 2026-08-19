import type { InkStroke, Item, Pad, SettingRecord, Uuid } from '@/types/domain';

/**
 * Repository interfaces.
 *
 * The user interface depends on these types only. They describe intent ("archive
 * this pad") rather than storage mechanics, which keeps SQL entirely inside the
 * storage feature area and leaves room for an encrypted implementation later.
 */

export type NewPad = Partial<Omit<Pad, 'id' | 'createdAt' | 'updatedAt'>> & { id?: Uuid };
export type PadPatch = Partial<Omit<Pad, 'id' | 'createdAt'>>;

export interface PadRepository {
  list(options?: { includeArchived?: boolean; includeDeleted?: boolean }): Promise<Pad[]>;
  get(id: Uuid): Promise<Pad | null>;
  create(pad: NewPad): Promise<Pad>;
  update(id: Uuid, patch: PadPatch): Promise<void>;
  /** Restores an archived or deleted pad. */
  restore(id: Uuid): Promise<void>;
  archive(id: Uuid): Promise<void>;
  softDelete(id: Uuid): Promise<void>;
  /** Irreversible. Removes the pad and everything on it. */
  purge(id: Uuid): Promise<void>;
  purgeDeletedBefore(iso: string): Promise<number>;
  count(): Promise<number>;
}

export type NewItem = Omit<
  Item,
  'createdAt' | 'updatedAt' | 'archivedAt' | 'deletedAt' | 'project' | 'bundleId'
> &
  Partial<Pick<Item, 'createdAt' | 'updatedAt' | 'project' | 'bundleId'>>;
export type ItemPatch = Partial<Omit<Item, 'id' | 'padId' | 'createdAt'>>;

export interface ItemRepository {
  listByPad(padId: Uuid, options?: { includeArchived?: boolean }): Promise<Item[]>;
  listAll(options?: {
    includeArchived?: boolean;
    includeDeleted?: boolean;
    limit?: number;
  }): Promise<Item[]>;
  listDeleted(limit?: number): Promise<Item[]>;
  listArchived(limit?: number): Promise<Item[]>;
  get(id: Uuid): Promise<Item | null>;
  create(item: NewItem): Promise<Item>;
  createMany(items: readonly NewItem[]): Promise<Item[]>;
  update(id: Uuid, patch: ItemPatch): Promise<void>;
  updateMany(patches: ReadonlyArray<{ id: Uuid; patch: ItemPatch }>): Promise<void>;
  archive(ids: readonly Uuid[]): Promise<void>;
  softDelete(ids: readonly Uuid[]): Promise<void>;
  restore(ids: readonly Uuid[]): Promise<void>;
  purge(ids: readonly Uuid[]): Promise<void>;
  purgeDeletedBefore(iso: string): Promise<number>;
  maxZIndex(padId: Uuid): Promise<number>;
  count(): Promise<number>;
}

export type NewInkStroke = Omit<InkStroke, 'createdAt' | 'updatedAt' | 'deletedAt'> &
  Partial<Pick<InkStroke, 'createdAt' | 'updatedAt'>>;
export type InkPatch = Partial<Pick<InkStroke, 'colour' | 'width' | 'points'>>;

export interface InkRepository {
  listByPad(padId: Uuid): Promise<InkStroke[]>;
  create(stroke: NewInkStroke): Promise<InkStroke>;
  update(id: Uuid, patch: InkPatch): Promise<void>;
  softDelete(ids: readonly Uuid[]): Promise<void>;
  restore(ids: readonly Uuid[]): Promise<void>;
  purge(ids: readonly Uuid[]): Promise<void>;
  purgeDeletedBefore(iso: string): Promise<number>;
  count(): Promise<number>;
}

export interface SettingsRepository {
  all(): Promise<SettingRecord[]>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}
