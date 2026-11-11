/**
 * `POST /render` and `PATCH /sketches/:id/edit`, through the real router with a
 * real in-memory database, and — for render — the real sandboxed child process.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setDb, type Db } from '../db.js';
import { testApp } from '../testing.js';



/** Decode the PNGs this plugin writes: 8-bit RGBA, filter 0 on every row. */
function decodePng(bytes: Buffer): { w: number; h: number; rgba: Buffer } {
  expect(bytes.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  let at = 8;
  let w = 0;
  let h = 0;
  const idat: Buffer[] = [];
  while (at < bytes.length) {
    const len = bytes.readUInt32BE(at);
    const type = bytes.toString('latin1', at + 4, at + 8);
    const data = bytes.subarray(at + 8, at + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
    }
    if (type === 'IDAT') idat.push(data);
    at += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const rgba = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y += 1) raw.copy(rgba, y * w * 4, y * (w * 4 + 1) + 1, (y + 1) * (w * 4 + 1));
  return { w, h, rgba };
}

const px = (img: { w: number; rgba: Buffer }, x: number, y: number): number[] => {
  const i = (y * img.w + x) * 4;
  return [...img.rgba.subarray(i, i + 4)];
};

describe('blit: render and edit routes', () => {
  let app: express.Express;
  let db: Db;

  beforeAll(() => {
    ({ app, db } = testApp());
  });

  afterAll(() => setDb(null));

  beforeEach(() => {
    db.exec('DELETE FROM sketches');
  });

  const save = (name: string, code: string): number =>
    Number(db.prepare('INSERT INTO sketches (name, code) VALUES (?, ?)').run(name, code).lastInsertRowid);

  const render = (body: object) =>
    request(app)
      .post('/api/blit/render')
      .send(body)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      });

  const json = (res: { body: Buffer }) => JSON.parse(res.body.toString('utf8'));

  describe('POST /render', () => {
    it('renders unsaved code with the real engine, upscaled, as a PNG', async () => {
      const res = await render({ code: "size(4, 2); out(solid('#e43b44'))", background: 'transparent' }).expect(200);
      expect(res.headers['content-type']).toMatch(/^image\/png/);
      const img = decodePng(res.body);
      // Auto scale: the largest that keeps the longest side within 1024.
      expect(res.headers['x-blit-scale']).toBe('16');
      expect([img.w, img.h]).toEqual([64, 32]);
      expect(px(img, 63, 31)).toEqual([0xe4, 0x3b, 0x44, 255]);
    }, 20_000);

    it('renders a saved sketch by id, and shows transparency on a checkerboard by default', async () => {
      const id = save('Dot', "size(2, 1); out(sprite('w.'))");
      const img = decodePng((await render({ id, scale: 8 }).expect(200)).body);
      expect([img.w, img.h]).toEqual([16, 8]);
      expect(px(img, 0, 0)).toEqual([255, 255, 255, 255]);
      // The transparent half is checker, opaque, and not white.
      expect(px(img, 8, 0)[3]).toBe(255);
      expect(px(img, 8, 0)).not.toEqual([255, 255, 255, 255]);
    }, 20_000);

    it('lays several frames out as a contact sheet, in frame order', async () => {
      const code = "size(1, 1); cycle(4); out(frames('#ff0000', '#00ff00', '#0000ff', '#ffffff'))";
      const res = await render({ code, count: 4, scale: 4, background: '#000000' }).expect(200);
      const img = decodePng(res.body);
      // 2x2 grid of 4px frames with a 4px gutter.
      expect([img.w, img.h]).toEqual([12, 12]);
      expect(px(img, 0, 0)).toEqual([255, 0, 0, 255]);
      expect(px(img, 8, 0)).toEqual([0, 255, 0, 255]);
      expect(px(img, 0, 8)).toEqual([0, 0, 255, 255]);
      expect(px(img, 8, 8)).toEqual([255, 255, 255, 255]);
      expect(res.headers['x-blit-frames']).toBe('0-3 of cycle 4 at 12fps');
    }, 20_000);

    it('resolves blit() against the caller’s own sketches', async () => {
      save('Coin', "size(2, 2); out(solid('#ffcd75'))");
      const res = await render({ code: "size(4, 4); out(scene(solid('#000000'), blit('Coin', 2, 2)))", scale: 1 }).expect(200);
      const img = decodePng(res.body);
      expect(px(img, 0, 0)).toEqual([0, 0, 0, 255]);
      expect(px(img, 3, 3)).toEqual([0xff, 0xcd, 0x75, 255]);
    }, 20_000);

    it('answers 422 with the engine message and position when the sketch fails', async () => {
      const res = await render({ code: 'size(8, 8);\nout(nope());' }).expect(422);
      expect(json(res).error).toMatch(/nope is not defined/);
      expect(json(res).error).toMatch(/line 2/);
    }, 20_000);

    it('kills a sketch that never finishes', async () => {
      const res = await render({ code: 'for (;;) {}' }).expect(422);
      expect(json(res).error).toMatch(/longer than/);
    }, 30_000);

    it('gives a sketch no way out of the sandbox', async () => {
      const probe = (expr: string) =>
        `size(1, 1); let v; try { v = ${expr}; } catch (e) { v = 'blocked'; } out(solid(v === 'blocked' || v === undefined ? '#00ff00' : '#ff0000'))`;
      for (const expr of [
        "this.constructor.constructor('return process')()",
        "Function('return process')()",
        "Function('return require')()",
        "(() => { try { return globalThis.process } catch (e) { return 'blocked' } })()",
        "Object.getPrototypeOf(globalThis) && Object.getPrototypeOf(globalThis).constructor.constructor('return process')()",
        'typeof require === "undefined" ? undefined : require',
      ]) {
        const img = decodePng((await render({ code: probe(expr), scale: 1, background: 'transparent' }).expect(200)).body);
        expect(px(img, 0, 0), expr).toEqual([0, 255, 0, 255]);
      }
    }, 60_000);

    it('refuses a missing sketch, and a request with nothing to render', async () => {
      await render({ id: 999 }).expect(404);
      await render({}).expect(400);
      await render({ code: "solid('#fff')", count: 17 }).expect(400);
      await render({ code: "solid('#fff')", background: 'plaid' }).expect(400);
    }, 20_000);
  });

  describe('PATCH /sketches/:id/edit', () => {
    const edit = (id: number, edits: unknown) => request(app).patch(`/api/blit/sketches/${id}/edit`).send({ edits });

    it('applies exact find/replace edits in order and answers a lint instead of the code', async () => {
      const id = save('Ship', "size(8, 8);\nout(solid('#e43b44'));\n");
      const res = await edit(id, [
        { find: '#e43b44', replace: '#41a6f6' },
        { find: 'size(8, 8)', replace: 'size(16, 16)' },
      ]).expect(200);
      expect(res.body.data.replacements).toBe(2);
      expect(res.body.data.code).toBeUndefined();
      expect(res.body.data.lint.ok).toBe(true);
      const row = db.prepare('SELECT code FROM sketches WHERE id = ?').get(id) as { code: string };
      expect(row.code).toBe("size(16, 16);\nout(solid('#41a6f6'));\n");
    });

    it('keeps whitespace exact, so a sprite row can be edited', async () => {
      const id = save('Grid', 'sprite(`\n  .ww.\n  wwww\n`)');
      await edit(id, [{ find: '  wwww\n', replace: '  w..w\n' }]).expect(200);
      const row = db.prepare('SELECT code FROM sketches WHERE id = ?').get(id) as { code: string };
      expect(row.code).toBe('sprite(`\n  .ww.\n  w..w\n`)');
    });

    it('refuses an ambiguous or missing find and saves nothing', async () => {
      const code = "stack(solid('#fff'), solid('#fff'))";
      const id = save('Twice', code);
      const ambiguous = await edit(id, [{ find: "'#fff'", replace: "'#000'" }]).expect(409);
      expect(ambiguous.body.error).toMatch(/matches 2 places/);
      const missing = await edit(id, [
        { find: 'stack', replace: 'scene' },
        { find: 'nowhere', replace: '' },
      ]).expect(409);
      expect(missing.body.error).toMatch(/Edit 2/);
      expect((db.prepare('SELECT code FROM sketches WHERE id = ?').get(id) as { code: string }).code).toBe(code);

      const all = await edit(id, [{ find: "'#fff'", replace: "'#000'", all: true }]).expect(200);
      expect(all.body.data.replacements).toBe(2);
    });

    it('reports a sketch the edit broke, and still saves it', async () => {
      const id = save('Break', "out(solid('#fff'))");
      const res = await edit(id, [{ find: 'solid', replace: 'soild' }]).expect(200);
      expect(res.body.data.lint.ok).toBe(false);
      expect(res.body.data.lint.diagnostics[0].rule).toBe('unknown-name');
    });

    it('validates the edit list, and answers 404 for a missing sketch', async () => {
      const id = save('Mine', "solid('#fff')");
      await edit(id, []).expect(400);
      await edit(id, [{ find: '', replace: 'x' }]).expect(400);
      await edit(id, [{ find: 'a' }]).expect(400);
      await edit(999, [{ find: 'solid', replace: 'fill' }]).expect(404);
    });
  });
});
