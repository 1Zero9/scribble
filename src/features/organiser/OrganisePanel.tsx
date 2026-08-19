import { useMemo, useState } from 'react';
import { Check, ShieldCheck, WandSparkles } from 'lucide-react';
import { type Suggestion } from '@/services/organiser/types';
import { localRulesOrganiser } from '@/services/organiser/localRules';
import { itemPreview } from '@/lib/itemText';
import { tidy, type PositionedRect } from '@/lib/geometry';
import { textToHtml } from '@/services/security/sanitise';
import { Panel } from '@/components/Panel';
import { useDeskStore } from '@/store/deskStore';
import { useUiStore } from '@/store/uiStore';

/**
 * The Organise review panel.
 *
 * Nothing here changes a note. Suggestions are produced on this device by
 * deterministic rules, each one shows the exact wording that triggered it, and
 * the user must choose an action for a suggestion before anything happens.
 * Even then, Scribble only adds a new summary note or moves cards on the pad —
 * the original notes' content is never rewritten.
 */
export function OrganisePanel() {
  const closePanel = useUiStore((state) => state.closePanel);
  const announce = useUiStore((state) => state.announce);
  const notify = useUiStore((state) => state.notify);

  const items = useDeskStore((state) => state.items);
  const selection = useDeskStore((state) => state.selection);
  const createItem = useDeskStore((state) => state.createItem);
  const updateItems = useDeskStore((state) => state.updateItems);

  const [applied, setApplied] = useState<string[]>([]);

  const scope = selection.length > 0 ? items.filter((item) => selection.includes(item.id)) : items;
  const result = useMemo(() => localRulesOrganiser.analyse(scope), [scope]);

  async function addSummaryNote(suggestion: Suggestion): Promise<void> {
    const members = scope.filter((item) =>
      suggestion.members.some((member) => member.itemId === item.id),
    );
    const lines = [
      `${suggestion.label}`,
      '',
      ...members.map((item) => `• ${itemPreview(item, 90)}`),
      '',
      'Suggested by Scribble’s local rules. The original notes are unchanged.',
    ];

    const anchor = members.reduce(
      (best, item) => (item.y < best.y ? item : best),
      members[0] ?? { x: 80, y: 80 },
    );

    await createItem(
      'text',
      { kind: 'text', html: textToHtml(lines.join('\n')) },
      { x: anchor.x - 300, y: anchor.y },
      { colour: 'sky', width: 280, height: 200, focus: false },
    );
    setApplied((current) => [...current, `${suggestion.id}:summary`]);
    announce(`Summary note added for ${suggestion.label}.`);
  }

  function gather(suggestion: Suggestion): void {
    const members = scope.filter((item) =>
      suggestion.members.some((member) => member.itemId === item.id),
    );
    if (members.length < 2) return;

    const rects: PositionedRect[] = members.map((item) => ({
      id: item.id,
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
    }));
    const moves = tidy(rects);
    const patches = Object.entries(moves).map(([id, point]) => ({ id, patch: point }));
    if (patches.length === 0) {
      notify('Those notes are already tidy.', 'info');
      return;
    }
    void updateItems(patches);
    setApplied((current) => [...current, `${suggestion.id}:gather`]);
    announce(`${patches.length} notes gathered together.`);
  }

  return (
    <Panel
      title="Organise"
      description={
        selection.length > 0
          ? `Reviewing ${selection.length} selected notes.`
          : `Reviewing all ${scope.length} notes on this pad.`
      }
      onClose={closePanel}
      width="wide"
    >
      <div
        className="mb-4 flex items-start gap-2 rounded-[var(--sb-radius-control)] p-3 text-xs"
        style={{ background: 'var(--sb-success-soft)', border: '1px solid var(--sb-border)' }}
      >
        <ShieldCheck
          size={16}
          aria-hidden="true"
          className="mt-0.5 shrink-0"
          style={{ color: 'var(--sb-success)' }}
        />
        <p>
          <strong>Local, rules-based, and reviewable.</strong> {result.method} No artificial
          intelligence model is used and nothing leaves this device. Suggestions are only applied
          when you choose an action below, and your original notes are never rewritten.
        </p>
      </div>

      {result.suggestions.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <WandSparkles size={26} aria-hidden="true" style={{ color: 'var(--sb-text-subtle)' }} />
          <p className="text-sm" style={{ color: 'var(--sb-text-muted)' }}>
            {scope.length === 0
              ? 'There is nothing on this pad to review yet.'
              : 'No groups stood out across these notes. Try selecting more notes first.'}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {result.suggestions.map((suggestion) => (
            <li
              key={suggestion.id}
              className="rounded-[var(--sb-radius-control)] p-3"
              style={{
                border: '1px solid var(--sb-border)',
                background: 'var(--sb-surface-raised)',
              }}
            >
              <div className="flex flex-wrap items-baseline gap-2">
                <h3 className="text-sm font-semibold">{suggestion.label}</h3>
                <span className="sb-chip">{suggestion.members.length} notes</span>
              </div>
              <p className="mt-1 text-xs" style={{ color: 'var(--sb-text-muted)' }}>
                {suggestion.reason}
              </p>

              <ul className="mt-2 flex flex-col gap-1">
                {suggestion.members.slice(0, 6).map((member) => (
                  <li
                    key={member.itemId}
                    className="truncate text-xs"
                    style={{ color: 'var(--sb-text-muted)' }}
                  >
                    <span aria-hidden="true">— </span>
                    <q>{member.evidence}</q>
                  </li>
                ))}
                {suggestion.members.length > 6 ? (
                  <li className="text-xs" style={{ color: 'var(--sb-text-subtle)' }}>
                    …and {suggestion.members.length - 6} more
                  </li>
                ) : null}
              </ul>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="sb-button text-xs"
                  onClick={() => void addSummaryNote(suggestion)}
                  disabled={applied.includes(`${suggestion.id}:summary`)}
                >
                  {applied.includes(`${suggestion.id}:summary`) ? (
                    <>
                      <Check size={14} aria-hidden="true" /> Summary added
                    </>
                  ) : (
                    'Add a summary note'
                  )}
                </button>
                <button
                  type="button"
                  className="sb-button text-xs"
                  onClick={() => gather(suggestion)}
                  disabled={applied.includes(`${suggestion.id}:gather`)}
                >
                  {applied.includes(`${suggestion.id}:gather`) ? (
                    <>
                      <Check size={14} aria-hidden="true" /> Gathered
                    </>
                  ) : (
                    'Gather these on the pad'
                  )}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
