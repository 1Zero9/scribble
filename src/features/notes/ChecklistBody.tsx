import { useRef } from 'react';
import { Plus, X } from 'lucide-react';
import type { ChecklistEntry, ItemContent } from '@/types/domain';
import { newId } from '@/lib/ids';

interface ChecklistBodyProps {
  title: string;
  entries: ChecklistEntry[];
  editing: boolean;
  onChange: (content: Extract<ItemContent, { kind: 'checklist' }>) => void;
  onFinish: () => void;
}

/** A checklist note. Each row is a real checkbox, so it works with a screen reader. */
export function ChecklistBody({ title, entries, editing, onChange, onFinish }: ChecklistBodyProps) {
  const listRef = useRef<HTMLUListElement>(null);

  function update(next: Partial<{ title: string; entries: ChecklistEntry[] }>): void {
    onChange({ kind: 'checklist', title, entries, ...next });
  }

  function addEntry(afterIndex: number): void {
    const entry: ChecklistEntry = { id: newId(), text: '', done: false };
    const next = [...entries];
    next.splice(afterIndex + 1, 0, entry);
    update({ entries: next });
    requestAnimationFrame(() => {
      const inputs = listRef.current?.querySelectorAll('input[type="text"]');
      (inputs?.[afterIndex + 1] as HTMLInputElement | undefined)?.focus();
    });
  }

  return (
    <div className="flex h-full flex-col gap-1 overflow-auto text-sm">
      <input
        className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 font-medium hover:border-[var(--sb-border)] focus:border-[var(--sb-border)]"
        value={title}
        placeholder="Checklist"
        aria-label="Checklist title"
        onChange={(event) => update({ title: event.target.value })}
        maxLength={200}
      />

      <ul ref={listRef} className="flex flex-col gap-0.5">
        {entries.map((entry, index) => (
          <li key={entry.id} className="group flex items-center gap-2">
            <input
              type="checkbox"
              checked={entry.done}
              aria-label={entry.text === '' ? `Item ${index + 1}` : entry.text}
              onChange={(event) =>
                update({
                  entries: entries.map((candidate) =>
                    candidate.id === entry.id
                      ? { ...candidate, done: event.target.checked }
                      : candidate,
                  ),
                })
              }
              style={{ accentColor: 'var(--sb-accent)', width: 16, height: 16 }}
            />
            <input
              type="text"
              className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-[var(--sb-border)] focus:border-[var(--sb-border)]"
              value={entry.text}
              placeholder="Add an item"
              aria-label={`Item ${index + 1} text`}
              style={entry.done ? { textDecoration: 'line-through', opacity: 0.65 } : undefined}
              maxLength={2000}
              onChange={(event) =>
                update({
                  entries: entries.map((candidate) =>
                    candidate.id === entry.id
                      ? { ...candidate, text: event.target.value }
                      : candidate,
                  ),
                })
              }
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.ctrlKey) {
                  event.preventDefault();
                  addEntry(index);
                }
                if (event.key === 'Enter' && event.ctrlKey) {
                  event.preventDefault();
                  onFinish();
                }
                if (event.key === 'Backspace' && entry.text === '' && entries.length > 1) {
                  event.preventDefault();
                  update({ entries: entries.filter((candidate) => candidate.id !== entry.id) });
                }
              }}
            />
            <button
              type="button"
              className="sb-icon-button opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              style={{ width: 28, height: 28 }}
              aria-label={`Remove item ${index + 1}`}
              onClick={() =>
                update({ entries: entries.filter((candidate) => candidate.id !== entry.id) })
              }
            >
              <X size={13} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>

      {editing || entries.length === 0 ? (
        <button
          type="button"
          className="sb-button sb-button--quiet self-start text-xs"
          onClick={() => addEntry(entries.length - 1)}
        >
          <Plus size={14} aria-hidden="true" />
          Add item
        </button>
      ) : null}
    </div>
  );
}
