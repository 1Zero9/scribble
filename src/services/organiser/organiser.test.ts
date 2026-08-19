import { describe, expect, it } from 'vitest';
import { localRulesOrganiser } from '@/services/organiser/localRules';
import type { Item, ItemContent } from '@/types/domain';
import { textToHtml } from '@/services/security/sanitise';

let counter = 0;

function note(text: string): Item {
  counter += 1;
  const content: ItemContent = { kind: 'text', html: textToHtml(text) };
  return {
    id: `item-${counter}`,
    padId: 'pad-1',
    itemType: 'text',
    content,
    x: 0,
    y: 0,
    width: 260,
    height: 160,
    zIndex: 0,
    colour: 'neutral',
    pinned: false,
    createdAt: '2026-08-18T09:00:00.000Z',
    updatedAt: '2026-08-18T09:00:00.000Z',
    archivedAt: null,
    deletedAt: null,
  };
}

function groups(items: Item[]): string[] {
  return localRulesOrganiser.analyse(items).suggestions.map((suggestion) => suggestion.group);
}

describe('local rules organiser', () => {
  it('declares that it runs on this device', () => {
    const result = localRulesOrganiser.analyse([]);
    expect(result.processing).toBe('local');
    expect(result.method).toMatch(/on this device/i);
  });

  it('is deterministic', () => {
    const items = [note('Need to send the report'), note('Must call Dave about the invoice')];
    expect(localRulesOrganiser.analyse(items)).toEqual(localRulesOrganiser.analyse(items));
  });

  it('groups notes that read like actions', () => {
    const items = [
      note('Need to send the risk report'),
      note('Chase the supplier for a quote'),
      note('The weather was pleasant'),
    ];
    const actions = localRulesOrganiser
      .analyse(items)
      .suggestions.find((suggestion) => suggestion.group === 'actions');

    expect(actions?.members).toHaveLength(2);
    expect(actions?.members.map((member) => member.itemId)).not.toContain(items[2]?.id);
  });

  it('recognises decisions, reminders, questions, dates and links', () => {
    expect(groups([note('We agreed to postpone'), note('Decision: use option B')])).toContain(
      'decisions',
    );
    expect(groups([note('Remember the badge'), note('Reminder: deadline is close')])).toContain(
      'reminders',
    );
    expect(groups([note('Who owns this?'), note('When is it due?')])).toContain('questions');
    expect(groups([note('Meeting on Tuesday'), note('Due 14/09/2026')])).toContain('dates');
    expect(
      groups([note('See https://example.com'), note('Also https://example.org/docs')]),
    ).toContain('links');
  });

  it('groups notes mentioning the same person', () => {
    const items = [
      note('Spoke with Sarah Whitfield about the migration'),
      note('Follow up with Sarah Whitfield next week'),
    ];
    const person = localRulesOrganiser
      .analyse(items)
      .suggestions.find((suggestion) => suggestion.group === 'people');

    expect(person?.label).toBe('Sarah Whitfield');
    expect(person?.members).toHaveLength(2);
  });

  it('never suggests a group containing a single note', () => {
    const result = localRulesOrganiser.analyse([note('Need to send the report')]);
    expect(result.suggestions.every((suggestion) => suggestion.members.length >= 2)).toBe(true);
  });

  it('finds related notes that share distinctive words', () => {
    const items = [
      note('Warehouse stocktake process needs revising before quarter end'),
      note('Warehouse stocktake revising the counting process again'),
    ];
    expect(groups(items)).toContain('related');
  });

  it('provides quoted evidence for every member', () => {
    const items = [note('Need to send the report'), note('Need to call the supplier')];
    const result = localRulesOrganiser.analyse(items);
    for (const suggestion of result.suggestions) {
      for (const member of suggestion.members) {
        expect(member.evidence.length).toBeGreaterThan(0);
      }
    }
  });

  it('produces nothing for empty notes', () => {
    expect(localRulesOrganiser.analyse([note(''), note('')]).suggestions).toEqual([]);
  });

  it('reports how many notes it examined', () => {
    expect(localRulesOrganiser.analyse([note('a'), note('b')]).examined).toBe(2);
  });
});
