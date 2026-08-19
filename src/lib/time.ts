import type { Timestamp } from '@/types/domain';

export function now(): Timestamp {
  return new Date().toISOString();
}

/** UK English relative description, used throughout the Drawer and search. */
export function formatRelative(iso: Timestamp, reference: Date = new Date()): string {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return 'Unknown';

  const seconds = Math.round((reference.getTime() - value.getTime()) / 1000);
  if (seconds < 45) return 'Just now';
  if (seconds < 90) return 'A minute ago';

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minutes ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? 'An hour ago' : `${hours} hours ago`;

  const days = Math.round(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.round(days / 7)} weeks ago`;

  return formatDate(iso);
}

export function formatDate(iso: Timestamp): string {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return 'Unknown';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(value);
}

export function formatDateTime(iso: Timestamp): string {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return 'Unknown';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
}

export function formatClock(value: Date, showSeconds: boolean): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    ...(showSeconds ? { second: '2-digit' } : {}),
    hour12: false,
  }).format(value);
}

export function formatLongDate(value: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(value);
}

export type DateFilter = 'any' | 'today' | 'week' | 'month';

export function isWithinDateFilter(
  iso: Timestamp,
  filter: DateFilter,
  reference: Date = new Date(),
): boolean {
  if (filter === 'any') return true;
  const value = new Date(iso).getTime();
  if (Number.isNaN(value)) return false;

  const day = 24 * 60 * 60 * 1000;
  const spans: Record<Exclude<DateFilter, 'any'>, number> = {
    today: day,
    week: 7 * day,
    month: 30 * day,
  };
  return reference.getTime() - value <= spans[filter];
}

/** Returns the ISO timestamp `days` before `reference`. */
export function isoDaysAgo(days: number, reference: Date = new Date()): Timestamp {
  return new Date(reference.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}
