-- Blit sketches and the folders they are filed in.
--
-- The code IS the document. Canvas size, frame rate and cycle length are set by
-- the sketch itself (`size()`, `fps()`, `cycle()`), so they are not columns.
-- Zoom has no home in the code (it is how far away you are standing), so it is
-- stored per sketch. Its default repeats `DEFAULT_ZOOM` in client/lib/zoom.ts.
--
-- NULL is the top level, for a folder's parent and a sketch's folder alike.
-- No foreign keys: the routes keep the invariants (no cycles, a deleted
-- folder's contents moving up rather than vanishing).
CREATE TABLE IF NOT EXISTS folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id INTEGER,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id);

-- Siblings cannot share a name, case aside. COALESCE because SQLite treats
-- NULLs as distinct in a unique index.
CREATE UNIQUE INDEX IF NOT EXISTS idx_folders_sibling_name
  ON folders(COALESCE(parent_id, 0), name COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS sketches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  zoom INTEGER NOT NULL DEFAULT 2,
  folder_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sketches_updated ON sketches(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_sketches_folder ON sketches(folder_id);
