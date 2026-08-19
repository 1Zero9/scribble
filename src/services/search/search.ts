import type { Item, ItemType, Pad } from '@/types/domain';
import { itemPreview, itemText } from '@/lib/itemText';
import { isWithinDateFilter, type DateFilter } from '@/lib/time';

/**
 * Local search.
 *
 * Search runs entirely in memory over material already loaded from the local
 * database. It is a simple, predictable substring and token match rather than a
 * ranked index: at prototype scale that is fast, and it never surprises the user
 * by hiding a note they know they typed.
 */

export interface SearchFilters {
  types: readonly ItemType[];
  date: DateFilter;
  includeArchived: boolean;
  includeDeleted: boolean;
  /** Restricts results to notes tagged with exactly this project, when set. */
  project: string | null;
}

export const DEFAULT_FILTERS: SearchFilters = {
  types: [],
  date: 'any',
  includeArchived: true,
  includeDeleted: false,
  project: null,
};

/** The distinct, non-empty project tags in use, for building a filter list. */
export function projectsInUse(items: readonly Item[]): string[] {
  const seen = new Set<string>();
  for (const item of items) if (item.project) seen.add(item.project);
  return [...seen].sort((a, b) => a.localeCompare(b));
}

export interface ItemResult {
  kind: 'item';
  item: Item;
  padName: string;
  preview: string;
  score: number;
}

export interface PadResult {
  kind: 'pad';
  pad: Pad;
  score: number;
}

export type SearchResult = ItemResult | PadResult;

function tokenise(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function scoreText(haystack: string, tokens: readonly string[]): number {
  if (tokens.length === 0) return 0;
  const lower = haystack.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    const index = lower.indexOf(token);
    if (index === -1) return 0;
    // Matches nearer the start, and matches on a word boundary, rank higher.
    score += 10 - Math.min(9, Math.floor(index / 40));
    if (index === 0 || /\W/.test(lower.charAt(index - 1))) score += 3;
  }
  return score;
}

export function padDisplayName(pad: Pad): string {
  return pad.name?.trim() ? pad.name : 'Untitled Pad';
}

export function searchPads(pads: readonly Pad[], query: string): PadResult[] {
  const tokens = tokenise(query);
  if (tokens.length === 0) return [];
  return pads
    .map((pad) => ({ kind: 'pad' as const, pad, score: scoreText(padDisplayName(pad), tokens) }))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score);
}

export function searchItems(
  items: readonly Item[],
  pads: readonly Pad[],
  query: string,
  filters: SearchFilters = DEFAULT_FILTERS,
  reference: Date = new Date(),
): ItemResult[] {
  const tokens = tokenise(query);
  const padNames = new Map(pads.map((pad) => [pad.id, padDisplayName(pad)]));

  return items
    .filter((item) => {
      if (!filters.includeDeleted && item.deletedAt !== null) return false;
      if (!filters.includeArchived && item.archivedAt !== null) return false;
      if (filters.types.length > 0 && !filters.types.includes(item.itemType)) return false;
      if (filters.project !== null && item.project !== filters.project) return false;
      return isWithinDateFilter(item.updatedAt, filters.date, reference);
    })
    .map((item) => {
      const text = item.project ? `${itemText(item)} ${item.project}` : itemText(item);
      const score = tokens.length === 0 ? 1 : scoreText(text, tokens);
      return {
        kind: 'item' as const,
        item,
        padName: padNames.get(item.padId) ?? 'Unknown pad',
        preview: itemPreview(item),
        score,
      };
    })
    .filter((result) => result.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.item.updatedAt.localeCompare(a.item.updatedAt);
    });
}

export function search(
  items: readonly Item[],
  pads: readonly Pad[],
  query: string,
  filters: SearchFilters = DEFAULT_FILTERS,
  reference: Date = new Date(),
): SearchResult[] {
  // Browsing a project needs no typed text; everything else does.
  if (query.trim() === '' && filters.project === null) return [];
  return [...searchPads(pads, query), ...searchItems(items, pads, query, filters, reference)];
}
