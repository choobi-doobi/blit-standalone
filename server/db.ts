/**
 * The app's one SQLite database.
 *
 * `BLIT_DB` names the file (default `data/blit.db`, `:memory:` for tests).
 * Migrations in `server/migrations` run once each, recorded in
 * `migrations_applied`, the first time the database is opened.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = path.join(HERE, 'migrations');

export interface Db {
  prepare: Database.Database['prepare'];
  exec: Database.Database['exec'];
  /** Run `fn` inside a transaction and return what it returns. */
  transaction<T>(fn: (tx: Db) => T): T;
  close(): void;
}

export function runMigrations(raw: Database.Database, dir = MIGRATIONS_DIR): void {
  raw.exec('CREATE TABLE IF NOT EXISTS migrations_applied (name TEXT PRIMARY KEY)');
  const applied = new Set(
    (raw.prepare('SELECT name FROM migrations_applied').all() as Array<{ name: string }>).map((r) => r.name),
  );
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    if (applied.has(file)) continue;
    raw.transaction(() => {
      raw.exec(fs.readFileSync(path.join(dir, file), 'utf8'));
      raw.prepare('INSERT INTO migrations_applied (name) VALUES (?)').run(file);
    })();
  }
}

export function openDb(file: string): Db {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const raw = new Database(file);
  if (file !== ':memory:') raw.pragma('journal_mode = WAL');
  raw.pragma('foreign_keys = OFF');
  runMigrations(raw);
  const wrapper: Db = {
    prepare: raw.prepare.bind(raw),
    exec: raw.exec.bind(raw),
    transaction: (fn) => raw.transaction(() => fn(wrapper))(),
    close: () => raw.close(),
  };
  return wrapper;
}

let current: Db | null = null;

/** The open database, opened on first use. */
export function db(): Db {
  if (!current) current = openDb(process.env.BLIT_DB ?? path.resolve(HERE, '..', 'data', 'blit.db'));
  return current;
}

/** Swap the database (tests). Closes the previous one. */
export function setDb(next: Db | null): void {
  if (current && current !== next) current.close();
  current = next;
}
