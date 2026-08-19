import type { Item, Uuid } from '@/types/domain';

/**
 * The organiser contract.
 *
 * The prototype ships one implementation, `localRulesOrganiser`, which uses
 * deterministic text rules and runs entirely on the device. An optional
 * on-device model could be added later by providing another implementation of
 * this interface — nothing in the interface exposes note content to a network.
 *
 * An organiser may only *suggest*. Applying a suggestion is a separate,
 * explicit action taken by the user, and it never rewrites the original note.
 */

export const SUGGESTION_GROUPS = [
  'actions',
  'decisions',
  'reminders',
  'questions',
  'people',
  'dates',
  'links',
  'related',
] as const;

export type SuggestionGroup = (typeof SUGGESTION_GROUPS)[number];

export const GROUP_LABELS: Record<SuggestionGroup, string> = {
  actions: 'Actions',
  decisions: 'Decisions',
  reminders: 'Reminders',
  questions: 'Questions',
  people: 'People',
  dates: 'Dates',
  links: 'Links',
  related: 'Related notes',
};

export interface SuggestionMember {
  itemId: Uuid;
  /** Short, quoted evidence from the note, so the user can judge the suggestion. */
  evidence: string;
}

export interface Suggestion {
  id: string;
  group: SuggestionGroup;
  label: string;
  reason: string;
  members: SuggestionMember[];
}

export interface OrganiseResult {
  suggestions: Suggestion[];
  /** Number of notes examined. Useful for the empty state. */
  examined: number;
  /** How the analysis was performed, shown to the user without exception. */
  method: string;
  processing: 'local';
}

export interface Organiser {
  readonly name: string;
  analyse(items: readonly Item[]): OrganiseResult;
}
