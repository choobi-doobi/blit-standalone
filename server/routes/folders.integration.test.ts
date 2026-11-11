/**
 * Folders, and filing sketches in them, driven through the real router.
 *
 * Same harness as the sketch routes: an in-memory SQLite with the plugin's own
 * migrations applied, so the tree's invariants are checked against the schema
 * that ships rather than a stand-in.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setDb, type Db } from '../db.js';
import { testApp } from '../testing.js';




describe('blit: folder routes', () => {
  let app: express.Express;
  let db: Db;

  beforeAll(() => {
    ({ app, db } = testApp());
  });

  afterAll(() => setDb(null));

  beforeEach(() => {
    db.exec('DELETE FROM sketches; DELETE FROM folders;');
  });

  const folder = async (name: string, parent_id?: number | null): Promise<number> =>
    (await request(app).post('/api/blit/folders').send(parent_id === undefined ? { name } : { name, parent_id }).expect(201)).body.data.id;
  const sketch = async (name: string, folder_id?: number | null): Promise<number> =>
    (await request(app).post('/api/blit/sketches').send(folder_id === undefined ? { name } : { name, folder_id }).expect(201)).body.data.id;
  const row = (table: 'folders' | 'sketches', id: number) =>
    db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as Record<string, unknown>;
  /** Back-date a sketch, so "unchanged" cannot pass merely because the clock did not tick. */
  const backdate = (id: number) => db.prepare("UPDATE sketches SET updated_at = '2020-01-01 00:00:00' WHERE id = ?").run(id);

  describe('creating and listing', () => {
    it('creates top-level and nested folders and lists them alphabetically, case aside', async () => {
      const zeta = await folder('zeta');
      const alpha = await folder('Alpha');
      const inner = await folder('inner', alpha);
      const res = await request(app).get('/api/blit/folders').expect(200);
      expect(res.body.data.map((f: { name: string }) => f.name)).toEqual(['Alpha', 'inner', 'zeta']);
      expect(row('folders', inner)).toMatchObject({ parent_id: alpha });
      expect(row('folders', zeta)).toMatchObject({ parent_id: null });
    });

    it('trims the name and refuses a blank or overlong one', async () => {
      const res = await request(app).post('/api/blit/folders').send({ name: '  Tiles  ' }).expect(201);
      expect(res.body.data.name).toBe('Tiles');
      await request(app).post('/api/blit/folders').send({ name: '   ' }).expect(400);
      await request(app).post('/api/blit/folders').send({}).expect(400);
      await request(app).post('/api/blit/folders').send({ name: 'n'.repeat(121) }).expect(400);
      await request(app).post('/api/blit/folders').send({ name: 'n'.repeat(120) }).expect(201);
    });

    it('refuses a parent that is not a folder id or null, rather than reading it as the top level', async () => {
      for (const parent_id of [0, '3', false, 1.5, -1]) {
        await request(app).post('/api/blit/folders').send({ name: 'x', parent_id }).expect(400);
      }
      expect(db.prepare('SELECT COUNT(*) AS n FROM folders').get()).toEqual({ n: 0 });
      await request(app).post('/api/blit/folders').send({ name: 'x', parent_id: null }).expect(201);
    });

    it('answers 404 for a parent that is missing', async () => {
      await request(app).post('/api/blit/folders').send({ name: 'x', parent_id: 999 }).expect(404);
      expect(db.prepare('SELECT COUNT(*) AS n FROM folders').get()).toEqual({ n: 0 });
    });

    it('refuses a sibling with the same name, case aside, at the top level and inside a folder', async () => {
      const top = await folder('Enemies');
      const res = await request(app).post('/api/blit/folders').send({ name: 'ENEMIES' }).expect(409);
      expect(res.body.error).toContain('Enemies');
      await folder('Bats', top);
      await request(app).post('/api/blit/folders').send({ name: 'bats', parent_id: top }).expect(409);
      // The same name somewhere else is a different folder.
      await folder('Bats');
    });

    it('lists every folder, alphabetically', async () => {
      await folder('beta');
      await folder('Alpha');
      const res = await request(app).get('/api/blit/folders').expect(200);
      expect(res.body.data.map((f: { name: string }) => f.name)).toEqual(['Alpha', 'beta']);
    });
  });

  describe('renaming and moving a folder', () => {
    it('renames a folder, and lets it change only its own case', async () => {
      const id = await folder('Tiles');
      await request(app).patch(`/api/blit/folders/${id}`).send({ name: 'Terrain' }).expect(200);
      expect(row('folders', id).name).toBe('Terrain');
      // Its own name is not a clash with itself.
      await request(app).patch(`/api/blit/folders/${id}`).send({ name: 'TERRAIN' }).expect(200);
      expect(row('folders', id).name).toBe('TERRAIN');
    });

    it('refuses a rename onto a sibling’s name', async () => {
      await folder('Enemies');
      const id = await folder('Tiles');
      await request(app).patch(`/api/blit/folders/${id}`).send({ name: 'enemies' }).expect(409);
      expect(row('folders', id).name).toBe('Tiles');
    });

    it('refuses an empty patch rather than touching the timestamp', async () => {
      const id = await folder('Tiles');
      await request(app).patch(`/api/blit/folders/${id}`).send({}).expect(400);
    });

    it('moves a folder inside another and back out to the top level', async () => {
      const a = await folder('A');
      const b = await folder('B');
      await request(app).patch(`/api/blit/folders/${b}`).send({ parent_id: a }).expect(200);
      expect(row('folders', b).parent_id).toBe(a);
      await request(app).patch(`/api/blit/folders/${b}`).send({ parent_id: null }).expect(200);
      expect(row('folders', b).parent_id).toBeNull();
    });

    it('refuses to move a folder inside itself or anything under it', async () => {
      const a = await folder('A');
      const b = await folder('B', a);
      const c = await folder('C', b);
      await request(app).patch(`/api/blit/folders/${a}`).send({ parent_id: a }).expect(400);
      await request(app).patch(`/api/blit/folders/${a}`).send({ parent_id: b }).expect(400);
      await request(app).patch(`/api/blit/folders/${a}`).send({ parent_id: c }).expect(400);
      expect(row('folders', a).parent_id).toBeNull();
      // Sideways and upwards are fine: C can leave B for A.
      await request(app).patch(`/api/blit/folders/${c}`).send({ parent_id: a }).expect(200);
    });

    it('refuses a move that lands on a namesake', async () => {
      const a = await folder('A');
      await folder('Bats', a);
      const bats = await folder('bats');
      await request(app).patch(`/api/blit/folders/${bats}`).send({ parent_id: a }).expect(409);
      expect(row('folders', bats).parent_id).toBeNull();
    });

    it('answers 404 for a missing folder, as the folder or as the destination', async () => {
      const mine = await folder('Mine');
      await request(app).patch('/api/blit/folders/999').send({ name: 'Ghost' }).expect(404);
      await request(app).patch(`/api/blit/folders/${mine}`).send({ parent_id: 999 }).expect(404);
      expect(row('folders', mine)).toMatchObject({ name: 'Mine', parent_id: null });
    });
  });

  describe('deleting a folder', () => {
    it('keeps everything that was in it, one level up, with edit times untouched', async () => {
      const outer = await folder('Outer');
      const doomed = await folder('Doomed', outer);
      const child = await folder('Child', doomed);
      const s1 = await sketch('Ship', doomed);
      const s2 = await sketch('Deep', child);
      backdate(s1);
      const res = await request(app).delete(`/api/blit/folders/${doomed}`).expect(200);
      expect(res.body.data).toEqual({ id: doomed, parent_id: outer, moved_sketches: 1, moved_folders: 1 });
      expect(row('folders', doomed)).toBeUndefined();
      expect(row('folders', child).parent_id).toBe(outer);
      expect(row('sketches', s1)).toMatchObject({ folder_id: outer, updated_at: '2020-01-01 00:00:00' });
      // A grandchild keeps its own folder: only the direct contents move.
      expect(row('sketches', s2).folder_id).toBe(child);
      expect(db.prepare('SELECT COUNT(*) AS n FROM sketches').get()).toEqual({ n: 2 });
    });

    it('moves a top-level folder’s contents to the top level', async () => {
      const doomed = await folder('Doomed');
      const s = await sketch('Ship', doomed);
      await request(app).delete(`/api/blit/folders/${doomed}`).expect(200);
      expect(row('sketches', s).folder_id).toBeNull();
    });

    it('renames a child that meets a namesake on the way up, rather than refusing the delete', async () => {
      await folder('Bats');
      await folder('Bats (2)');
      const doomed = await folder('Doomed');
      const bats = await folder('bats', doomed);
      await request(app).delete(`/api/blit/folders/${doomed}`).expect(200);
      expect(row('folders', bats)).toMatchObject({ parent_id: null, name: 'bats (3)' });
    });

    it('lets a child take the deleted folder’s own name', async () => {
      const doomed = await folder('Sprites');
      const child = await folder('Sprites', doomed);
      await request(app).delete(`/api/blit/folders/${doomed}`).expect(200);
      expect(row('folders', child)).toMatchObject({ parent_id: null, name: 'Sprites' });
    });

    it('answers 404 for a missing folder and leaves the rest alone', async () => {
      const mine = await folder('Mine');
      await request(app).delete('/api/blit/folders/999').expect(404);
      expect(row('folders', mine)).toBeDefined();
    });
  });

  describe('filing sketches', () => {
    it('creates a sketch straight into a folder, and lists where each one is', async () => {
      const f = await folder('Enemies');
      const inside = await sketch('Bat', f);
      const outside = await sketch('Ship');
      const res = await request(app).get('/api/blit/sketches').expect(200);
      const byId = new Map(res.body.data.map((s: { id: number; folder_id: number | null }) => [s.id, s.folder_id]));
      expect(byId.get(inside)).toBe(f);
      expect(byId.get(outside)).toBeNull();
    });

    it('refuses to create a sketch in a missing folder, and stores nothing', async () => {
      await request(app).post('/api/blit/sketches').send({ name: 'Bat', folder_id: 999 }).expect(404);
      await request(app).post('/api/blit/sketches').send({ name: 'Bat', folder_id: 0 }).expect(400);
      expect(db.prepare('SELECT COUNT(*) AS n FROM sketches').get()).toEqual({ n: 0 });
    });

    it('moves a sketch between folders without touching its edit time, code or zoom', async () => {
      const a = await folder('A');
      const s = (await request(app).post('/api/blit/sketches').send({ name: 'Bat', code: 'sprite(`w`)', zoom: 8 }).expect(201)).body
        .data.id;
      backdate(s);
      const res = await request(app).put(`/api/blit/sketches/${s}/folder`).send({ folder_id: a }).expect(200);
      expect(res.body.data).toMatchObject({ id: s, folder_id: a, code: 'sprite(`w`)', zoom: 8, updated_at: '2020-01-01 00:00:00' });
      await request(app).put(`/api/blit/sketches/${s}/folder`).send({ folder_id: null }).expect(200);
      expect(row('sketches', s)).toMatchObject({ folder_id: null, updated_at: '2020-01-01 00:00:00' });
    });

    it('needs folder_id to be said out loud', async () => {
      const s = await sketch('Bat');
      await request(app).put(`/api/blit/sketches/${s}/folder`).send({}).expect(400);
      await request(app).put(`/api/blit/sketches/${s}/folder`).send({ folder_id: '1' }).expect(400);
    });

    it('answers 404 for a missing sketch or folder', async () => {
      const mine = await sketch('Mine');
      const myFolder = await folder('Mine');
      await request(app).put('/api/blit/sketches/999/folder').send({ folder_id: myFolder }).expect(404);
      await request(app).put(`/api/blit/sketches/${mine}/folder`).send({ folder_id: 999 }).expect(404);
      expect(row('sketches', mine).folder_id).toBeNull();
    });
  });
});
