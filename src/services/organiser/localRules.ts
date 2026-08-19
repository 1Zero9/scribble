import type { Item } from '@/types/domain';
import { itemText } from '@/lib/itemText';
import {
  GROUP_LABELS,
  type Organiser,
  type OrganiseResult,
  type Suggestion,
  type SuggestionGroup,
  type SuggestionMember,
} from './types';

/**
 * Deterministic, on-device organiser rules.
 *
 * There is no model, no training data and no network access here: the same input
 * always produces the same output, and every suggestion carries the exact phrase
 * that triggered it so the user can check the reasoning. Originals are never
 * modified — the caller decides what, if anything, to do with a suggestion.
 */

interface Rule {
  group: SuggestionGroup;
  reason: string;
  pattern: RegExp;
}

const RULES: readonly Rule[] = [
  {
    group: 'actions',
    reason: 'Contains wording that usually describes something to do.',
    pattern:
      /\b(action|to ?do|todo|need to|needs to|must|should|chase|follow up|send|email|call|book|arrange|draft|review|prepare|check|update|raise|confirm|schedule|assign|complete|finish)\b/i,
  },
  {
    group: 'decisions',
    reason: 'Contains wording that usually records a decision.',
    pattern:
      /\b(decided|decision|agreed|agreement|approved|signed off|sign-off|we will|going with|chosen|selected|rejected|confirmed that)\b/i,
  },
  {
    group: 'reminders',
    reason: 'Contains wording that usually marks a reminder.',
    pattern:
      /\b(remember|remind|reminder|don'?t forget|do not forget|chase up|follow-up|deadline|due)\b/i,
  },
  {
    group: 'questions',
    reason: 'Asks a question.',
    pattern:
      /(\?\s*$)|(\?\s)|\b(who|what|when|where|why|how|which|should we|can we|do we|is it)\b.*\?/im,
  },
  {
    group: 'links',
    reason: 'Contains a web address.',
    pattern: /\bhttps?:\/\/\S+/i,
  },
  {
    group: 'dates',
    reason: 'Mentions a specific day or date.',
    pattern:
      /\b(today|tomorrow|tonight|next week|this week|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|\d{1,2}(?:st|nd|rd|th)\b)/i,
  },
];

/** Two capitalised words in a row, not at the start of a sentence, read as a name. */
const PERSON_PATTERN = /(?<![.!?]\s)(?<!^)\b([A-Z][a-z]{1,15})\s([A-Z][a-z]{1,15})\b/gm;

const STOP_WORDS = new Set([
  'about',
  'after',
  'again',
  'against',
  'because',
  'been',
  'before',
  'being',
  'between',
  'both',
  'could',
  'does',
  'doing',
  'down',
  'during',
  'each',
  'from',
  'further',
  'have',
  'having',
  'here',
  'into',
  'itself',
  'more',
  'most',
  'once',
  'only',
  'other',
  'over',
  'same',
  'should',
  'some',
  'such',
  'than',
  'that',
  'their',
  'them',
  'then',
  'there',
  'these',
  'they',
  'this',
  'those',
  'through',
  'under',
  'until',
  'very',
  'were',
  'what',
  'when',
  'where',
  'which',
  'while',
  'will',
  'with',
  'would',
  'your',
  'note',
  'notes',
]);

function evidenceFor(text: string, match: RegExpMatchArray | null): string {
  if (!match || match.index === undefined) return text.slice(0, 80).trim();
  const start = Math.max(0, match.index - 24);
  const end = Math.min(text.length, match.index + match[0].length + 40);
  const snippet = text.slice(start, end).replace(/\s+/g, ' ').trim();
  return `${start > 0 ? '…' : ''}${snippet}${end < text.length ? '…' : ''}`;
}

function distinctiveWords(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .split(/[^a-z0-9']+/)
    .filter((word) => word.length >= 4 && !STOP_WORDS.has(word));
  return new Set(words);
}

export const localRulesOrganiser: Organiser = {
  name: 'Local rules',

  analyse(items: readonly Item[]): OrganiseResult {
    const texts = new Map<string, string>();
    for (const item of items) texts.set(item.id, itemText(item));

    const buckets = new Map<SuggestionGroup, SuggestionMember[]>();

    for (const rule of RULES) {
      for (const item of items) {
        const text = texts.get(item.id) ?? '';
        if (text.trim() === '') continue;
        const match = text.match(rule.pattern);
        if (!match) continue;
        const members = buckets.get(rule.group) ?? [];
        members.push({ itemId: item.id, evidence: evidenceFor(text, match) });
        buckets.set(rule.group, members);
      }
    }

    // People are grouped per name so the suggestion is specific and checkable.
    const peopleByName = new Map<string, SuggestionMember[]>();
    for (const item of items) {
      const text = texts.get(item.id) ?? '';
      for (const match of text.matchAll(PERSON_PATTERN)) {
        const name = `${match[1]} ${match[2]}`;
        const members = peopleByName.get(name) ?? [];
        if (!members.some((member) => member.itemId === item.id)) {
          members.push({ itemId: item.id, evidence: evidenceFor(text, match) });
        }
        peopleByName.set(name, members);
      }
    }

    const suggestions: Suggestion[] = [];

    for (const [group, members] of buckets) {
      if (members.length < 2) continue;
      suggestions.push({
        id: `group-${group}`,
        group,
        label: GROUP_LABELS[group],
        reason: RULES.find((rule) => rule.group === group)?.reason ?? '',
        members,
      });
    }

    for (const [name, members] of peopleByName) {
      if (members.length < 2) continue;
      suggestions.push({
        id: `person-${name.toLowerCase().replace(/\s+/g, '-')}`,
        group: 'people',
        label: name,
        reason: `Mentioned in ${members.length} notes.`,
        members,
      });
    }

    // Related notes: pairs sharing at least three distinctive words.
    const vocabulary = new Map<string, Set<string>>();
    for (const item of items) vocabulary.set(item.id, distinctiveWords(texts.get(item.id) ?? ''));

    const relatedClusters: string[][] = [];
    const assigned = new Set<string>();
    for (const item of items) {
      if (assigned.has(item.id)) continue;
      const own = vocabulary.get(item.id);
      if (!own || own.size < 3) continue;

      const cluster = [item.id];
      for (const other of items) {
        if (other.id === item.id || assigned.has(other.id)) continue;
        const theirs = vocabulary.get(other.id);
        if (!theirs) continue;
        const shared = [...own].filter((word) => theirs.has(word));
        if (shared.length >= 3) cluster.push(other.id);
      }
      if (cluster.length >= 2) {
        cluster.forEach((id) => assigned.add(id));
        relatedClusters.push(cluster);
      }
    }

    relatedClusters.forEach((cluster, index) => {
      const first = cluster[0];
      const own = first ? (vocabulary.get(first) ?? new Set<string>()) : new Set<string>();
      const shared = cluster
        .slice(1)
        .flatMap((id) => [...(vocabulary.get(id) ?? [])].filter((word) => own.has(word)));
      const keywords = [...new Set(shared)].slice(0, 4);
      suggestions.push({
        id: `related-${index}`,
        group: 'related',
        label: keywords.length > 0 ? keywords.join(', ') : `Related set ${index + 1}`,
        reason: 'These notes share several distinctive words.',
        members: cluster.map((id) => ({
          itemId: id,
          evidence: (texts.get(id) ?? '').slice(0, 80).replace(/\s+/g, ' ').trim(),
        })),
      });
    });

    return {
      suggestions: suggestions.sort((a, b) => b.members.length - a.members.length),
      examined: items.length,
      method: 'Deterministic keyword and pattern rules, run on this device.',
      processing: 'local',
    };
  },
};
