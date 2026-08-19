import { useEffect, useMemo, useState } from 'react';
import { FileText, Inbox, Search as SearchIcon } from 'lucide-react';
import { ITEM_TYPES, ITEM_TYPE_LABELS, type ItemType } from '@/types/domain';
import { formatRelative, type DateFilter } from '@/lib/time';
import { DEFAULT_FILTERS, padDisplayName, search } from '@/services/search/search';
import { Panel } from '@/components/Panel';
import { useDeskStore } from '@/store/deskStore';
import { useUiStore } from '@/store/uiStore';

/**
 * Search across every pad.
 *
 * Search reads only from the local database. Results are shown as they are
 * typed, and choosing one takes the user straight to the note with it selected.
 */
export function SearchPanel() {
  const closePanel = useUiStore((state) => state.closePanel);
  const drawer = useDeskStore((state) => state.drawer);
  const refreshDrawer = useDeskStore((state) => state.refreshDrawer);
  const openPad = useDeskStore((state) => state.openPad);
  const setSelection = useDeskStore((state) => state.setSelection);

  const [query, setQuery] = useState('');
  const [types, setTypes] = useState<ItemType[]>([]);
  const [date, setDate] = useState<DateFilter>('any');
  const [includeDeleted, setIncludeDeleted] = useState(false);

  useEffect(() => {
    void refreshDrawer();
  }, [refreshDrawer]);

  const pool = useMemo(
    () => [
      ...drawer.recentItems,
      ...drawer.archivedItems,
      ...(includeDeleted ? drawer.deletedItems : []),
    ],
    [drawer, includeDeleted],
  );

  const results = useMemo(
    () => search(pool, drawer.pads, query, { ...DEFAULT_FILTERS, types, date, includeDeleted }),
    [pool, drawer.pads, query, types, date, includeDeleted],
  );

  function toggleType(type: ItemType): void {
    setTypes((current) =>
      current.includes(type) ? current.filter((value) => value !== type) : [...current, type],
    );
  }

  return (
    <Panel
      title="Search"
      description="Everything on this device, across every pad."
      onClose={closePanel}
      width="wide"
    >
      <label className="sb-sr-only" htmlFor="search-input">
        Search pads and notes
      </label>
      <input
        id="search-input"
        className="sb-input"
        type="search"
        placeholder="Search pads and notes…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        autoComplete="off"
      />

      <fieldset className="mt-3 flex flex-wrap items-center gap-1.5 border-0 p-0">
        <legend className="sb-sr-only">Filter by content type</legend>
        {ITEM_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            className={
              types.includes(type) ? 'sb-button sb-button--primary text-xs' : 'sb-button text-xs'
            }
            aria-pressed={types.includes(type)}
            onClick={() => toggleType(type)}
          >
            {ITEM_TYPE_LABELS[type]}
          </button>
        ))}
      </fieldset>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs">
          <span>Updated</span>
          <select
            className="sb-input"
            style={{ width: 'auto' }}
            value={date}
            onChange={(event) => setDate(event.target.value as DateFilter)}
          >
            <option value="any">Any time</option>
            <option value="today">Last 24 hours</option>
            <option value="week">Last 7 days</option>
            <option value="month">Last 30 days</option>
          </select>
        </label>

        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={includeDeleted}
            onChange={(event) => setIncludeDeleted(event.target.checked)}
            style={{ accentColor: 'var(--sb-accent)' }}
          />
          Include recently deleted
        </label>
      </div>

      <div className="mt-4">
        {query.trim() === '' ? (
          <EmptyMessage
            icon={<SearchIcon size={26} />}
            message="Start typing to search your pads and notes."
          />
        ) : results.length === 0 ? (
          <EmptyMessage icon={<Inbox size={26} />} message="Nothing matched that search." />
        ) : (
          <>
            <p className="mb-2 text-xs" style={{ color: 'var(--sb-text-muted)' }} role="status">
              {results.length} result{results.length === 1 ? '' : 's'}
            </p>
            <ul className="flex flex-col gap-1.5">
              {results.map((result) => (
                <li key={result.kind === 'pad' ? result.pad.id : result.item.id}>
                  <button
                    type="button"
                    className="flex w-full items-start gap-2 rounded-[var(--sb-radius-control)] p-2 text-left"
                    style={{
                      border: '1px solid var(--sb-border)',
                      background: 'var(--sb-surface-raised)',
                    }}
                    onClick={() => {
                      if (result.kind === 'pad') {
                        void openPad(result.pad.id);
                      } else {
                        void openPad(result.item.padId).then(() => setSelection([result.item.id]));
                      }
                      closePanel();
                    }}
                  >
                    <FileText
                      size={14}
                      aria-hidden="true"
                      className="mt-1 shrink-0"
                      style={{ color: 'var(--sb-text-subtle)' }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">
                        {result.kind === 'pad' ? padDisplayName(result.pad) : result.preview}
                      </span>
                      <span className="block text-xs" style={{ color: 'var(--sb-text-muted)' }}>
                        {result.kind === 'pad'
                          ? `Pad · updated ${formatRelative(result.pad.updatedAt)}`
                          : `${ITEM_TYPE_LABELS[result.item.itemType]} · ${result.padName} · ${formatRelative(result.item.updatedAt)}`}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Panel>
  );
}

function EmptyMessage({ icon, message }: { icon: React.ReactNode; message: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      <span aria-hidden="true" style={{ color: 'var(--sb-text-subtle)' }}>
        {icon}
      </span>
      <p className="text-sm" style={{ color: 'var(--sb-text-muted)' }}>
        {message}
      </p>
    </div>
  );
}
