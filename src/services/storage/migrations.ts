/**
 * Schema migrations.
 *
 * Migrations are ordered, immutable and applied exactly once. They are declared
 * in TypeScript rather than in the Tauri SQL plugin so that the same schema is
 * exercised by unit tests, the browser adapter and the desktop application.
 */
export interface Migration {
  readonly id: number;
  readonly name: string;
  readonly statements: readonly string[];
}

export const MIGRATIONS: readonly Migration[] = [
  {
    id: 1,
    name: 'initial_schema',
    statements: [
      `CREATE TABLE IF NOT EXISTS pads (
        id            TEXT PRIMARY KEY NOT NULL,
        name          TEXT,
        background    TEXT NOT NULL DEFAULT 'paper',
        grid_type     TEXT NOT NULL DEFAULT 'dots',
        snap_enabled  INTEGER NOT NULL DEFAULT 1,
        zoom          REAL NOT NULL DEFAULT 1,
        viewport_x    REAL NOT NULL DEFAULT 0,
        viewport_y    REAL NOT NULL DEFAULT 0,
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL,
        archived_at   TEXT,
        deleted_at    TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS items (
        id          TEXT PRIMARY KEY NOT NULL,
        pad_id      TEXT NOT NULL REFERENCES pads(id) ON DELETE CASCADE,
        item_type   TEXT NOT NULL,
        content     TEXT NOT NULL,
        position_x  REAL NOT NULL DEFAULT 0,
        position_y  REAL NOT NULL DEFAULT 0,
        width       REAL NOT NULL DEFAULT 260,
        height      REAL NOT NULL DEFAULT 160,
        z_index     INTEGER NOT NULL DEFAULT 0,
        colour      TEXT NOT NULL DEFAULT 'neutral',
        pinned      INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL,
        archived_at TEXT,
        deleted_at  TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS ink_strokes (
        id          TEXT PRIMARY KEY NOT NULL,
        pad_id      TEXT NOT NULL REFERENCES pads(id) ON DELETE CASCADE,
        colour      TEXT NOT NULL,
        width       REAL NOT NULL,
        points_json TEXT NOT NULL,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL,
        deleted_at  TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS settings (
        key        TEXT PRIMARY KEY NOT NULL,
        value      TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_pads_updated_at ON pads (updated_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_pads_deleted_at ON pads (deleted_at)`,
      `CREATE INDEX IF NOT EXISTS idx_pads_archived_at ON pads (archived_at)`,
      `CREATE INDEX IF NOT EXISTS idx_items_pad_id ON items (pad_id)`,
      `CREATE INDEX IF NOT EXISTS idx_items_pad_live ON items (pad_id, deleted_at, archived_at)`,
      `CREATE INDEX IF NOT EXISTS idx_items_updated_at ON items (updated_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_items_deleted_at ON items (deleted_at)`,
      `CREATE INDEX IF NOT EXISTS idx_items_type ON items (item_type)`,
      `CREATE INDEX IF NOT EXISTS idx_ink_pad_id ON ink_strokes (pad_id, deleted_at)`,
    ],
  },
  {
    id: 2,
    name: 'project_and_bundles',
    statements: [
      `ALTER TABLE items ADD COLUMN project TEXT`,
      `ALTER TABLE items ADD COLUMN bundle_id TEXT`,
      `CREATE INDEX IF NOT EXISTS idx_items_project ON items (project)`,
      `CREATE INDEX IF NOT EXISTS idx_items_bundle_id ON items (bundle_id)`,
    ],
  },
];

export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]?.id ?? 0;
