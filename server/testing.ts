/** Test harness: the real app over a fresh in-memory database. */
import type express from 'express';

import { createApp } from './app.js';
import { openDb, setDb, type Db } from './db.js';

export function testApp(): { app: express.Express; db: Db } {
  const db = openDb(':memory:');
  setDb(db);
  return { app: createApp({ serveClient: false }), db };
}
