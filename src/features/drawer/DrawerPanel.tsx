import { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  Copy,
  FileText,
  Inbox,
  ListFilter,
  RotateCcw,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { ITEM_TYPES, ITEM_TYPE_LABELS, type Item, type ItemType, type Pad } from '@/types/domain';
import { formatRelative, type DateFilter } from '@/lib/time';
import { itemPreview } from '@/lib/itemText';
import { padDisplayName } from '@/services/search/search';
import { Panel } from '@/components/Panel';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useDeskStore } from '@/store/deskStore';
import { useUiStore } from '@/store/uiStore';
import { useSettingsStore } from '@/store/settingsStore';

type Tab = 'pads' | 'recent' | 'archived' | 'deleted';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'pads', label: 'Pads' },
  { id: 'recent', label: 'Recent notes' },
  { id: 'archived', label: 'Archived' },
  { id: 'deleted', label: 'Recently deleted' },
];

/**
 * The Drawer.
 *
 * The Drawer is for retrieval, not filing: there are no folders, projects or
 * mandatory tags. A user searches or scans a short list, and gets something back.
 */
export function DrawerPanel() {
  const closePanel = useUiStore((state) => state.closePanel);
  const drawer = useDeskStore((state) => state.drawer);
  const refreshDrawer = useDeskStore((state) => state.refreshDrawer);
  const retentionDays = useSettingsStore((state) => state.settings.retentionDays);

  const [tab, setTab] = useState<Tab>('pads');
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<ItemType | 'all'>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('any');
  const [confirming, setConfirming] = useState<
    { kind: 'pad'; id: string; name: string } | { kind: 'items'; ids: string[] } | null
  >(null);

  useEffect(() => {
    void refreshDrawer();
  }, [refreshDrawer]);

  return (
    <Panel
      title="Drawer"
      description="Older pads and swept-away notes, kept on this device."
      onClose={closePanel}
      width="wide"
    >
      <div role="tablist" aria-label="Drawer sections" className="mb-3 flex flex-wrap gap-1">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            className={tab === entry.id ? 'sb-button sb-button--primary' : 'sb-button'}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="sb-sr-only" htmlFor="drawer-search">
          Search the Drawer
        </label>
        <input
          id="drawer-search"
          className="sb-input flex-1"
          style={{ minWidth: 180 }}
          placeholder="Search…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />

        {tab !== 'pads' ? (
          <>
            <label className="sb-sr-only" htmlFor="drawer-type">
              Filter by content type
            </label>
            <select
              id="drawer-type"
              className="sb-input"
              style={{ width: 'auto' }}
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value as ItemType | 'all')}
            >
              <option value="all">All types</option>
              {ITEM_TYPES.map((type) => (
                <option key={type} value={type}>
                  {ITEM_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </>
        ) : null}

        <label className="sb-sr-only" htmlFor="drawer-date">
          Filter by date
        </label>
        <select
          id="drawer-date"
          className="sb-input"
          style={{ width: 'auto' }}
          value={dateFilter}
          onChange={(event) => setDateFilter(event.target.value as DateFilter)}
        >
          <option value="any">Any time</option>
          <option value="today">Last 24 hours</option>
          <option value="week">Last 7 days</option>
          <option value="month">Last 30 days</option>
        </select>
        <ListFilter size={16} aria-hidden="true" style={{ color: 'var(--sb-text-subtle)' }} />
      </div>

      {tab === 'pads' ? (
        <PadList pads={drawer.pads} query={query} onConfirmDelete={setConfirming} />
      ) : (
        <ItemList
          items={
            tab === 'recent'
              ? drawer.recentItems
              : tab === 'archived'
                ? drawer.archivedItems
                : drawer.deletedItems
          }
          mode={tab}
          query={query}
          typeFilter={typeFilter}
          dateFilter={dateFilter}
          onConfirmDelete={setConfirming}
        />
      )}

      {tab === 'deleted' ? (
        <p
          className="mt-4 flex items-start gap-2 text-xs"
          style={{ color: 'var(--sb-text-muted)' }}
        >
          <TriangleAlert size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
          Deleted material is removed automatically after {retentionDays} days. You can change this
          in Settings.
        </p>
      ) : null}

      {confirming ? (
        <ConfirmDialog
          title="Delete permanently?"
          message={
            confirming.kind === 'pad'
              ? `“${confirming.name}” and everything on it will be removed from this device. This cannot be undone.`
              : `${confirming.ids.length} item${confirming.ids.length === 1 ? '' : 's'} will be removed from this device. This cannot be undone.`
          }
          confirmLabel="Delete permanently"
          tone="danger"
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            const store = useDeskStore.getState();
            if (confirming.kind === 'pad') void store.purgePad(confirming.id);
            else void store.purgeItems(confirming.ids);
            setConfirming(null);
          }}
        />
      ) : null}
    </Panel>
  );
}

type ConfirmTarget = { kind: 'pad'; id: string; name: string } | { kind: 'items'; ids: string[] };

function PadList({
  pads,
  query,
  onConfirmDelete,
}: {
  pads: Pad[];
  query: string;
  onConfirmDelete: (target: ConfirmTarget) => void;
}) {
  const openPad = useDeskStore((state) => state.openPad);
  const duplicatePad = useDeskStore((state) => state.duplicatePad);
  const archivePad = useDeskStore((state) => state.archivePad);
  const deletePad = useDeskStore((state) => state.deletePad);
  const restorePad = useDeskStore((state) => state.restorePad);
  const activePadId = useDeskStore((state) => state.activePadId);

  const filtered = useMemo(
    () =>
      pads.filter((pad) =>
        query.trim() === ''
          ? true
          : padDisplayName(pad).toLowerCase().includes(query.trim().toLowerCase()),
      ),
    [pads, query],
  );

  if (filtered.length === 0) return <Empty message="No pads match that." />;

  return (
    <ul className="flex flex-col gap-1.5">
      {filtered.map((pad) => {
        const state =
          pad.deletedAt !== null ? 'Deleted' : pad.archivedAt !== null ? 'Archived' : 'Active';
        return (
          <li
            key={pad.id}
            className="flex items-center gap-2 rounded-[var(--sb-radius-control)] p-2"
            style={{
              border: '1px solid var(--sb-border)',
              background:
                pad.id === activePadId ? 'var(--sb-accent-soft)' : 'var(--sb-surface-raised)',
            }}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{padDisplayName(pad)}</p>
              <p className="text-xs" style={{ color: 'var(--sb-text-muted)' }}>
                {state} · updated {formatRelative(pad.updatedAt)}
              </p>
            </div>

            {pad.deletedAt === null && pad.archivedAt === null ? (
              <>
                <SmallButton label="Open pad" onClick={() => void openPad(pad.id)}>
                  Open
                </SmallButton>
                <SmallIcon
                  label={`Duplicate ${padDisplayName(pad)}`}
                  onClick={() => void duplicatePad(pad.id)}
                >
                  <Copy size={14} />
                </SmallIcon>
                <SmallIcon
                  label={`Archive ${padDisplayName(pad)}`}
                  onClick={() => void archivePad(pad.id)}
                >
                  <Archive size={14} />
                </SmallIcon>
                <SmallIcon
                  label={`Delete ${padDisplayName(pad)}`}
                  onClick={() => void deletePad(pad.id)}
                  danger
                >
                  <Trash2 size={14} />
                </SmallIcon>
              </>
            ) : (
              <>
                <SmallIcon
                  label={`Restore ${padDisplayName(pad)}`}
                  onClick={() => void restorePad(pad.id)}
                >
                  <RotateCcw size={14} />
                </SmallIcon>
                <SmallIcon
                  label={`Permanently delete ${padDisplayName(pad)}`}
                  onClick={() =>
                    onConfirmDelete({ kind: 'pad', id: pad.id, name: padDisplayName(pad) })
                  }
                  danger
                >
                  <Trash2 size={14} />
                </SmallIcon>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ItemList({
  items,
  mode,
  query,
  typeFilter,
  dateFilter,
  onConfirmDelete,
}: {
  items: Item[];
  mode: Exclude<Tab, 'pads'>;
  query: string;
  typeFilter: ItemType | 'all';
  dateFilter: DateFilter;
  onConfirmDelete: (target: ConfirmTarget) => void;
}) {
  const restoreItems = useDeskStore((state) => state.restoreItems);
  const openPad = useDeskStore((state) => state.openPad);
  const setSelection = useDeskStore((state) => state.setSelection);
  const pads = useDeskStore((state) => state.drawer.pads);
  const closePanel = useUiStore((state) => state.closePanel);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (typeFilter !== 'all' && item.itemType !== typeFilter) return false;
      if (needle !== '' && !itemPreview(item, 400).toLowerCase().includes(needle)) return false;
      if (dateFilter === 'any') return true;
      const spans = { today: 1, week: 7, month: 30 } as const;
      const cutoff = Date.now() - spans[dateFilter] * 24 * 60 * 60 * 1000;
      return new Date(item.updatedAt).getTime() >= cutoff;
    });
  }, [items, query, typeFilter, dateFilter]);

  if (filtered.length === 0) {
    return (
      <Empty
        message={
          mode === 'deleted'
            ? 'Nothing has been deleted recently.'
            : mode === 'archived'
              ? 'Nothing has been archived yet.'
              : 'No recent notes match that.'
        }
      />
    );
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {filtered.map((item) => {
        const pad = pads.find((candidate) => candidate.id === item.padId);
        return (
          <li
            key={item.id}
            className="flex items-start gap-2 rounded-[var(--sb-radius-control)] p-2"
            style={{ border: '1px solid var(--sb-border)', background: 'var(--sb-surface-raised)' }}
          >
            <FileText
              size={14}
              aria-hidden="true"
              className="mt-1 shrink-0"
              style={{ color: 'var(--sb-text-subtle)' }}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{itemPreview(item)}</p>
              <p className="text-xs" style={{ color: 'var(--sb-text-muted)' }}>
                {ITEM_TYPE_LABELS[item.itemType]} · {pad ? padDisplayName(pad) : 'Unknown pad'} ·{' '}
                {formatRelative(item.updatedAt)}
              </p>
            </div>

            {mode === 'recent' ? (
              <SmallButton
                label="Show this note"
                onClick={() => {
                  void openPad(item.padId).then(() => setSelection([item.id]));
                  closePanel();
                }}
              >
                Show
              </SmallButton>
            ) : (
              <>
                <SmallIcon label="Restore this note" onClick={() => void restoreItems([item.id])}>
                  <RotateCcw size={14} />
                </SmallIcon>
                <SmallIcon
                  label="Permanently delete this note"
                  onClick={() => onConfirmDelete({ kind: 'items', ids: [item.id] })}
                  danger
                >
                  <Trash2 size={14} />
                </SmallIcon>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Empty({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      <Inbox size={28} aria-hidden="true" style={{ color: 'var(--sb-text-subtle)' }} />
      <p className="text-sm" style={{ color: 'var(--sb-text-muted)' }}>
        {message}
      </p>
    </div>
  );
}

function SmallButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" className="sb-button text-xs" aria-label={label} onClick={onClick}>
      {children}
    </button>
  );
}

function SmallIcon({
  label,
  onClick,
  children,
  danger,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className="sb-icon-button"
      style={{ width: 32, height: 32, ...(danger ? { color: 'var(--sb-danger)' } : {}) }}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <span aria-hidden="true">{children}</span>
    </button>
  );
}
