import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { DEFAULT_ZOOM } from '../client/lib/zoom.js';
import { runMigrations } from './db.js';

const columns = (db: Database.Database, table: string) =>
  db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string; dflt_value: string | null }>;

describe('blit: migrations', () => {
  it('creates the tables with the columns the routes read, and no owner column', () => {
    const db = new Database(':memory:');
    try {
      runMigrations(db);
      expect(columns(db, 'sketches').map((c) => c.name)).toEqual([
        'id', 'name', 'code', 'zoom', 'folder_id', 'created_at', 'updated_at',
      ]);
      expect(columns(db, 'folders').map((c) => c.name)).toEqual(['id', 'parent_id', 'name', 'created_at', 'updated_at']);
    } finally {
      db.close();
    }
  });

  it('defaults zoom to the zoom the editor opens at', () => {
    const db = new Database(':memory:');
    try {
      runMigrations(db);
      expect(Number(columns(db, 'sketches').find((c) => c.name === 'zoom')?.dflt_value)).toBe(DEFAULT_ZOOM);
    } finally {
      db.close();
    }
  });

  it('applies twice without error, because the ledger runs each file once', () => {
    const db = new Database(':memory:');
    try {
      runMigrations(db);
      expect(() => runMigrations(db)).not.toThrow();
    } finally {
      db.close();
    }
  });

  it('refuses two top-level folders with one name, case aside', () => {
    // SQLite treats NULLs as distinct in a unique index; the COALESCE is the backstop.
    const db = new Database(':memory:');
    try {
      runMigrations(db);
      db.prepare("INSERT INTO folders (parent_id, name) VALUES (NULL, 'Enemies')").run();
      expect(() => db.prepare("INSERT INTO folders (parent_id, name) VALUES (NULL, 'enemies')").run()).toThrow(/UNIQUE/);
    } finally {
      db.close();
    }
  });
});
