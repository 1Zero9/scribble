/**
 * Structured local logging.
 *
 * Logs stay in memory (and, in development, in the console). They never contain
 * note content, file paths, URLs or any other personal data: only an event
 * name, a category and non-identifying counters. Settings expose the buffer so a
 * user can inspect exactly what has been recorded.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  at: string;
  level: LogLevel;
  scope: string;
  event: string;
  /** Numeric or boolean facts only. Strings are rejected to avoid leaking content. */
  data?: Record<string, number | boolean>;
}

const MAX_ENTRIES = 500;
const buffer: LogEntry[] = [];
const listeners = new Set<(entries: readonly LogEntry[]) => void>();

function push(entry: LogEntry): void {
  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) buffer.splice(0, buffer.length - MAX_ENTRIES);
  listeners.forEach((listener) => listener(buffer));
}

function write(
  level: LogLevel,
  scope: string,
  event: string,
  data?: Record<string, number | boolean>,
): void {
  const entry: LogEntry = {
    at: new Date().toISOString(),
    level,
    scope,
    event,
    ...(data ? { data } : {}),
  };
  push(entry);
  if (import.meta.env.DEV) {
    const method = level === 'debug' ? 'log' : level;
    console[method](`[scribble:${scope}] ${event}`, data ?? '');
  }
}

export interface Logger {
  debug(event: string, data?: Record<string, number | boolean>): void;
  info(event: string, data?: Record<string, number | boolean>): void;
  warn(event: string, data?: Record<string, number | boolean>): void;
  error(event: string, data?: Record<string, number | boolean>): void;
}

export function createLogger(scope: string): Logger {
  return {
    debug: (event, data) => write('debug', scope, event, data),
    info: (event, data) => write('info', scope, event, data),
    warn: (event, data) => write('warn', scope, event, data),
    error: (event, data) => write('error', scope, event, data),
  };
}

export function readLog(): readonly LogEntry[] {
  return [...buffer];
}

export function clearLog(): void {
  buffer.length = 0;
  listeners.forEach((listener) => listener(buffer));
}

export function subscribeToLog(listener: (entries: readonly LogEntry[]) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Turns an unknown thrown value into a message that is safe and useful to show
 * to the user. Stack traces are never surfaced in the interface.
 */
export function describeError(error: unknown, fallback = 'Something went wrong.'): string {
  if (error instanceof Error && error.message.trim() !== '') return error.message;
  if (typeof error === 'string' && error.trim() !== '') return error;
  return fallback;
}
