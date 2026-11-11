/**
 * Sketch persistence, driven through the real router with supertest.
 *
 * The DB is a real in-memory SQLite with the plugin's own migrations applied, so
 * a column this code relies on and the migration forgot shows up here rather
 * than on install.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setDb, type Db } from '../db.js';
import { testApp } from '../testing.js';

import { DEFAULT_ZOOM } from '../../client/lib/zoom.js';




describe('blit: sketch routes', () => {
  let app: express.Express;
  let db: Db;
  /** How many times the routes opened a transaction, reset per test. */
  let transactions = 0;

  beforeAll(() => {
    ({ app, db } = testApp());
    const open = db.transaction;
    db.transaction = (fn) => {
      transactions += 1;
      return open(fn);
    };
  });

  afterAll(() => setDb(null));

  beforeEach(() => {
    transactions = 0;
    db.exec('DELETE FROM sketches');
  });

  const create = (body: Record<string, unknown>) => request(app).post('/api/blit/sketches').send(body);

  it('reports status', async () => {
    const res = await request(app).get('/api/blit/status').expect(200);
    expect(res.body.data).toMatchObject({ module: 'blit', status: 'operational' });
  });

  it('lists nothing before anything is saved', async () => {
    const res = await request(app).get('/api/blit/sketches').expect(200);
    expect(res.body).toEqual({ success: true, data: [] });
  });

  it('creates a sketch and answers 201 with the stored row', async () => {
    const res = await create({ name: 'Ship', code: 'sprite(`w`)' }).expect(201);
    expect(res.body.data).toMatchObject({ name: 'Ship', code: 'sprite(`w`)' });
    expect(typeof res.body.data.id).toBe('number');
  });

  it('trims the name and accepts an empty sketch body', async () => {
    const res = await create({ name: '  Ship  ' }).expect(201);
    expect(res.body.data).toMatchObject({ name: 'Ship', code: '' });
  });

  it('refuses a missing or blank name', async () => {
    await create({ code: 'x' }).expect(400);
    await create({ name: '   ', code: 'x' }).expect(400);
  });

  it('refuses a name or body past its limit', async () => {
    await create({ name: 'n'.repeat(121), code: '' }).expect(400);
    await create({ name: 'ok', code: 'c'.repeat(200_001) }).expect(400);
    // And accepts one exactly at the limit, so the boundary is not off by one.
    await create({ name: 'n'.repeat(120), code: 'c'.repeat(200_000) }).expect(201);
  });

  it('refuses code that is not a string', async () => {
    await create({ name: 'ok', code: { not: 'a string' } }).expect(400);
  });

  it('opens a new sketch at the default zoom without being told one', async () => {
    const res = await create({ name: 'Ship', code: '' }).expect(201);
    expect(res.body.data.zoom).toBe(DEFAULT_ZOOM);
  });

  it('stores the zoom a sketch was saved at', async () => {
    const res = await create({ name: 'Ship', code: '', zoom: 16 }).expect(201);
    expect(res.body.data.zoom).toBe(16);
    const one = await request(app).get(`/api/blit/sketches/${res.body.data.id}`).expect(200);
    expect(one.body.data.zoom).toBe(16);
  });

  it('refuses a zoom that is not one of the steps the editor offers', async () => {
    // The chips ARE the vocabulary: a stored 5 would open with no chip lit and
    // no way to get back to it.
    for (const zoom of [0, 3, 5, 17, 32, -8, 2.5, '8', null]) {
      await create({ name: 'Ship', code: '', zoom }).expect(400);
    }
  });

  it('saves the zoom on its own and keeps it across a code save', async () => {
    const { body } = await create({ name: 'Ship', code: 'a', zoom: 4 });
    const zoomed = await request(app)
      .patch(`/api/blit/sketches/${body.data.id}`)
      .send({ zoom: 12 })
      .expect(200);
    expect(zoomed.body.data).toMatchObject({ name: 'Ship', code: 'a', zoom: 12 });

    // A save that only carries new code must not reset how you were looking at it.
    const recoded = await request(app)
      .patch(`/api/blit/sketches/${body.data.id}`)
      .send({ code: 'b' })
      .expect(200);
    expect(recoded.body.data).toMatchObject({ code: 'b', zoom: 12 });
  });

  it('refuses a bad zoom on a patch without writing the rest of it', async () => {
    const { body } = await create({ name: 'Ship', code: 'a', zoom: 4 });
    await request(app).patch(`/api/blit/sketches/${body.data.id}`).send({ code: 'b', zoom: 5 }).expect(400);
    expect(db.prepare('SELECT code, zoom FROM sketches WHERE id = ?').get(body.data.id)).toEqual({
      code: 'a',
      zoom: 4,
    });
  });

  it('omits code from the list and includes it in the single read', async () => {
    const { body } = await create({ name: 'Ship', code: 'sprite(`w`)' });
    const list = await request(app).get('/api/blit/sketches').expect(200);
    expect(list.body.data[0]).not.toHaveProperty('code');
    const one = await request(app).get(`/api/blit/sketches/${body.data.id}`).expect(200);
    expect(one.body.data.code).toBe('sprite(`w`)');
  });

  it('lists the most recently edited first', async () => {
    const a = await create({ name: 'A', code: '' });
    const b = await create({ name: 'B', code: '' });
    // Same-second writes are common, so the ordering must break ties on id.
    const res = await request(app).get('/api/blit/sketches').expect(200);
    expect(res.body.data.map((s: { id: number }) => s.id)).toEqual([b.body.data.id, a.body.data.id]);
  });

  it('updates the code and moves updated_at', async () => {
    const { body } = await create({ name: 'Ship', code: 'a' });
    db.prepare("UPDATE sketches SET updated_at = '2020-01-01 00:00:00' WHERE id = ?").run(body.data.id);
    const res = await request(app).patch(`/api/blit/sketches/${body.data.id}`).send({ code: 'b' }).expect(200);
    expect(res.body.data.code).toBe('b');
    expect(res.body.data.updated_at).not.toBe('2020-01-01 00:00:00');
  });

  it('renames without touching the code, and vice versa', async () => {
    const { body } = await create({ name: 'Ship', code: 'a' });
    const renamed = await request(app).patch(`/api/blit/sketches/${body.data.id}`).send({ name: 'Boat' }).expect(200);
    expect(renamed.body.data).toMatchObject({ name: 'Boat', code: 'a' });
    const recoded = await request(app).patch(`/api/blit/sketches/${body.data.id}`).send({ code: 'b' }).expect(200);
    expect(recoded.body.data).toMatchObject({ name: 'Boat', code: 'b' });
  });

  it('refuses an empty patch rather than silently touching the timestamp', async () => {
    const { body } = await create({ name: 'Ship', code: 'a' });
    await request(app).patch(`/api/blit/sketches/${body.data.id}`).send({}).expect(400);
  });

  it('accepts an empty string as a deliberate code clear', async () => {
    const { body } = await create({ name: 'Ship', code: 'a' });
    const res = await request(app).patch(`/api/blit/sketches/${body.data.id}`).send({ code: '' }).expect(200);
    expect(res.body.data.code).toBe('');
  });

  it('deletes, and the row is really gone', async () => {
    const { body } = await create({ name: 'Ship', code: 'a' });
    await request(app).delete(`/api/blit/sketches/${body.data.id}`).expect(204);
    await request(app).get(`/api/blit/sketches/${body.data.id}`).expect(404);
    expect(db.prepare('SELECT COUNT(*) AS n FROM sketches').get()).toEqual({ n: 0 });
  });

  it('answers 404 for a sketch that never existed', async () => {
    await request(app).get('/api/blit/sketches/9999').expect(404);
    await request(app).patch('/api/blit/sketches/9999').send({ name: 'x' }).expect(404);
    await request(app).delete('/api/blit/sketches/9999').expect(404);
  });

  it('answers 400 for an id that is not a positive integer', async () => {
    for (const id of ['abc', '0', '-1']) {
      await request(app).get(`/api/blit/sketches/${id}`).expect(400);
    }
  });

  it('merges and writes a patch inside one transaction', async () => {
    // PATCH is a read-modify-write: it reads the row to fill in whichever of
    // name/code the request omitted, then writes the merge back. Two saves of
    // the same sketch that interleave between those two statements lose one of
    // them, and in a live-coding tool "save" firing twice quickly is the normal
    // case, not the exotic one. A transaction is what makes the pair atomic.
    //
    // This asserts the wrapper is there. better-sqlite3 is synchronous, so two
    // requests cannot actually interleave inside one test process, which means
    // the race itself is not reproducible here - the honest thing to pin is
    // that the read and the write are not two independent statements any more.
    const { body } = await create({ name: 'Mine', code: 'original' });
    transactions = 0;

    await request(app).patch(`/api/blit/sketches/${body.data.id}`).send({ code: 'next' }).expect(200);
    expect(transactions).toBe(1);

    // A rejected patch must not open one and leave it behind either.
    transactions = 0;
    await request(app).patch(`/api/blit/sketches/${body.data.id}`).send({}).expect(400);
    expect(db.prepare('SELECT code FROM sketches WHERE id = ?').get(body.data.id)).toEqual({ code: 'next' });
  });

  it('round-trips a sketch containing backticks and newlines unchanged', async () => {
    // The code column holds template literals; a mangling here would corrupt
    // every saved sprite.
    const code = 'size(4, 2);\nout(sprite(`\n  wwww\n  w..w\n`).pal({ w: "#fff" }));';
    const { body } = await create({ name: 'Grid', code });
    expect((await request(app).get(`/api/blit/sketches/${body.data.id}`)).body.data.code).toBe(code);
  });
});
