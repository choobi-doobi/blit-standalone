/**
 * The import route, driven through the real router with supertest.
 *
 * The unit tests cover the pixels; this covers the contract: that a real PNG goes
 * in over HTTP and emitted sprite source comes back out, that a refusal is a 200
 * carrying the sizes to try instead, and that the permission the host would demand
 * is demanded. The host's guard is host code and cannot be imported, so this
 * mounts a stand-in applying the same method-to-permission mapping
 * (`mcp/tools.test.ts` pins that mapping against every tool).
 */

import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setDb, type Db } from '../db.js';
import { testApp } from '../testing.js';

import { chunk, filterScanlines } from '../../client/lib/png.js';
import { IMPORT_MAX_COLORS, IMPORT_MAX_SIDE, IMPORT_MAX_SOURCE } from '../../client/lib/blit/importImage.js';



const SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

/** An RGBA PNG, built with the plugin's own encoder primitives. */
async function pngOf(rgba: Uint8Array | number[], w: number, h: number): Promise<Uint8Array> {
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, w);
  view.setUint32(4, h);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = filterScanlines(new Uint8Array(rgba), w, h);
  const stream = new Blob([raw as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'));
  const idat = new Uint8Array(await new Response(stream).arrayBuffer());
  const parts = [SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** Nearest-neighbour upscale: a sprite as it gets shared. */
function upscale(data: number[], w: number, h: number, k: number): Uint8Array {
  const out = new Uint8Array(w * k * h * k * 4);
  for (let y = 0; y < h * k; y += 1) {
    for (let x = 0; x < w * k; x += 1) {
      const si = (Math.floor(y / k) * w + Math.floor(x / k)) * 4;
      out.set(data.slice(si, si + 4), (y * w * k + x) * 4);
    }
  }
  return out;
}

/** A 4x2 sprite: white, red, blue-ish, transparent. */
const SPRITE = [
  255, 255, 255, 255, 192, 32, 32, 255, 60, 90, 200, 255, 0, 0, 0, 0,
  255, 255, 255, 255, 192, 32, 32, 255, 60, 90, 200, 255, 0, 0, 0, 0,
];

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');

describe('blit: POST /api/blit/import', () => {
  let app: express.Express;

  beforeAll(() => {
    ({ app } = testApp());
  });

  afterAll(() => setDb(null));


  const post = (body: object) => request(app).post('/api/blit/import').send(body);

  it('imports an image that already fits, with no size asked for', async () => {
    const res = await post({ png: b64(await pngOf(SPRITE, 4, 2)) }).expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.source).toEqual({ width: 4, height: 2 });
    expect(res.body.data.sprite.rows).toHaveLength(2);
    expect(res.body.data.sprite.rows[0]).toHaveLength(4);
    expect(res.body.data.sprite.colors).toBe(3);
    // Nothing to choose from, so nothing is offered.
    expect(res.body.data.options).toEqual([]);
    expect(res.body.data.refusal).toBeUndefined();
  });

  it('answers a whole sketch as well as the grid, for a caller with no editor', async () => {
    const res = await post({ png: b64(await pngOf(SPRITE, 4, 2)) }).expect(200);
    expect(res.body.data.sketch).toContain('size(4, 2);');
    expect(res.body.data.sketch).toContain('out(sprite(`');
    expect(res.body.data.sketch).toContain('.pal({');
  });

  it('accepts a data URL, because that is what a browser hands over', async () => {
    const png = b64(await pngOf(SPRITE, 4, 2));
    const res = await post({ png: `data:image/png;base64,${png}` }).expect(200);
    expect(res.body.data.sprite.width).toBe(4);
  });

  it('refuses to guess a size for a big image, and says what the sizes would be', async () => {
    const big = upscale(SPRITE, 4, 2, 64); // 256x128
    const res = await post({ png: b64(await pngOf(big, 256, 128)) }).expect(200);
    expect(res.body.data.sprite).toBeUndefined();
    expect(res.body.data.refusal).toContain('256x128');
    expect(res.body.data.options.length).toBeGreaterThan(0);
    for (const option of res.body.data.options) {
      expect(option.size).toBeLessThanOrEqual(IMPORT_MAX_SIDE);
      expect(option.colors).toBeGreaterThan(0);
    }
    // The image is a 4x2 scaled up, so one option imports it with nothing lost.
    expect(res.body.data.options.filter((o: { exact: boolean }) => o.exact)).toHaveLength(1);
  });

  it('downscales to the size asked for, and recovers the sprite exactly', async () => {
    const big = upscale(SPRITE, 4, 2, 64); // 256x128, really a 4x2
    const at4 = await post({ png: b64(await pngOf(big, 256, 128)), size: 4 }).expect(200);
    const direct = await post({ png: b64(await pngOf(SPRITE, 4, 2)) }).expect(200);

    expect(at4.body.data.source).toEqual({ width: 256, height: 128 });
    expect(at4.body.data.sprite.rows).toEqual(direct.body.data.sprite.rows);
    expect(at4.body.data.sprite.bindings).toEqual(direct.body.data.sprite.bindings);
    expect(at4.body.data.sketch).toBe(direct.body.data.sketch);
  });

  it('keeps the aspect ratio, so `size` is the longest side and not the width', async () => {
    const big = upscale(SPRITE, 4, 2, 32); // 128x64
    const res = await post({ png: b64(await pngOf(big, 128, 64)), size: 16 }).expect(200);
    expect([res.body.data.sprite.width, res.body.data.sprite.height]).toEqual([16, 8]);
  });

  it('refuses a grid it cannot name, without throwing away the sizes to try', async () => {
    // 400 distinct colours, upscaled. No size gets under the colour cap, and the
    // answer has to carry that rather than just failing.
    const many: number[] = [];
    for (let i = 0; i < 400; i += 1) many.push(i % 256, (i * 3) % 256, 255 - (i % 256), 255);
    const png = await pngOf(upscale(many, 20, 20, 16), 320, 320);
    const res = await post({ png: b64(png), size: 128 }).expect(200);
    expect(res.body.data.sprite).toBeUndefined();
    expect(res.body.data.refusal).toContain(`${IMPORT_MAX_COLORS}`);
    expect(res.body.data.options.every((o: { fits: boolean }) => !o.fits)).toBe(true);
  });

  it('refuses a body that is not carrying a PNG', async () => {
    await post({}).expect(400);
    await post({ png: 42 }).expect(400);
    await post({ png: '' }).expect(400);
    await post({ png: b64(new Uint8Array([1, 2, 3, 4])) }).expect(400);
    // Base64 of something long that is not a PNG: past the header check, so the
    // decoder's signature check is what has to catch it.
    const res = await post({ png: b64(new Uint8Array(200).fill(7)) }).expect(400);
    // And it has to read as a sentence: "that PNG as a PNG" is what naming the
    // bytes after the format they failed to be produces.
    expect(res.body.error).toContain("Couldn't read that file as a PNG");
  });

  it('refuses a size that is not a grid side', async () => {
    const png = b64(await pngOf(SPRITE, 4, 2));
    await post({ png, size: 0 }).expect(400);
    await post({ png, size: IMPORT_MAX_SIDE + 1 }).expect(400);
    await post({ png, size: 12.5 }).expect(400);
    await post({ png, size: '32' }).expect(400);
  });

  it('refuses a file past the file limit, in the importer\'s own words', async () => {
    const side = IMPORT_MAX_SOURCE + 1;
    const wide = new Uint8Array(side * 4).fill(255);
    const res = await post({ png: b64(await pngOf(wide, side, 1)) }).expect(400);
    expect(res.body.error).toContain(`${IMPORT_MAX_SOURCE}`);
  });

});
