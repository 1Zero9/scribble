/**
 * The storage port.
 *
 * Everything above this line in the architecture (repositories, services, UI)
 * depends only on this interface. Three adapters implement it:
 *
 *  - `tauriDatabase`  SQLite in the OS application-data folder (the product).
 *  - `webDatabase`    SQLite compiled to WebAssembly, for browser development
 *                     and Playwright tests.
 *  - `nodeDatabase`   Node's built-in SQLite, for unit tests.
 *
 * Because the port is this small, adding transparent encryption later means
 * writing one more adapter rather than changing the user interface.
 */
export interface Database {
  /** Runs a statement that returns no rows. */
  execute(sql: string, params?: readonly SqlValue[]): Promise<void>;
  /** Runs a query and returns typed rows. */
  select<T>(sql: string, params?: readonly SqlValue[]): Promise<T[]>;
  /** Runs a set of statements atomically. */
  transaction(work: (tx: Database) => Promise<void>): Promise<void>;
  /** Flushes any pending writes and releases the handle. */
  close(): Promise<void>;
  /** A short label describing where the data lives, shown in Settings. */
  readonly describeLocation: string;
}

export type SqlValue = string | number | null;

/**
 * Rewrites `?` placeholders into the `$1`-style placeholders expected by the
 * Tauri SQL plugin. Repository SQL is written with `?` so the same statements
 * run unchanged against every adapter.
 *
 * Repository SQL never contains string literals, so a naive scan is sufficient
 * and is covered by unit tests.
 */
export function toNumberedPlaceholders(sql: string): string {
  let index = 0;
  return sql.replace(/\?/g, () => {
    index += 1;
    return `$${index}`;
  });
}

/** Converts a boolean domain value into the integer SQLite stores. */
export function toSqlBool(value: boolean): number {
  return value ? 1 : 0;
}

export function fromSqlBool(value: unknown): boolean {
  return value === 1 || value === true || value === '1';
}
