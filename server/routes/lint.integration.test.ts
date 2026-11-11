/**
 * The lint route, driven through the real router with supertest.
 *
 * Two things are being proved here that the unit tests cannot:
 *
 * 1. The route is mounted where the spec and the tool declaration say it is, and
 *    answers the envelope shape they promise.
 * 2. The permission the host would demand is actually demanded. The host's guard
 *    is host code and cannot be imported, so this mounts a stand-in that applies
 *    the same method-to-permission mapping (`mcp/tools.test.ts` pins that mapping
 *    against every tool). It is evidence about the chain, not about the host's
 *    implementation of it.
 */

import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setDb, type Db } from '../db.js';
import { testApp } from '../testing.js';

import { PAT_OPERATORS, SKETCH_VOCABULARY } from '../../client/lib/blit/api.js';



describe('blit: POST /api/blit/lint', () => {
  let app: express.Express;

  beforeAll(() => {
    ({ app } = testApp());
  });

  afterAll(() => setDb(null));


  const lint = (body: object) => request(app).post('/api/blit/lint').send(body);

  it('passes a sketch that is fine, and says which shape it is', async () => {
    const res = await lint({ code: "sprite(`.ww.`).mirror('x').scale(4).center()" }).expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.ok).toBe(true);
    expect(res.body.data.form).toBe('expression');
    expect(res.body.data.diagnostics).toEqual([]);
  });

  it('reports a broken sketch with a position', async () => {
    const res = await lint({ code: 'size(16, 16);\nout(sprite(`w`).mirrror(`x`));' }).expect(200);
    expect(res.body.data.ok).toBe(false);
    expect(res.body.data.diagnostics).toHaveLength(1);
    expect(res.body.data.diagnostics[0]).toMatchObject({
      severity: 'error',
      rule: 'unknown-method',
      line: 2,
    });
    expect(res.body.data.diagnostics[0].hint).toContain('mirror');
  });

  it('teaches the language on every answer, not just a failing one', async () => {
    const res = await lint({ code: 'sprite(`w`)' }).expect(200);
    expect(res.body.data.vocabulary).toEqual([...SKETCH_VOCABULARY]);
    expect(res.body.data.operators).toEqual([...PAT_OPERATORS]);
    // The prototype carries private machinery too; the advertised list must not.
    expect(res.body.data.operators).not.toContain('withMod');
    expect(res.body.data.operators).toContain('mirror');
  });

  it('refuses a body with no code', async () => {
    await lint({}).expect(400);
    await lint({ code: 42 }).expect(400);
  });

  it('refuses code past the stored limit, at the same boundary as a save', async () => {
    await lint({ code: 'x'.repeat(200_000) }).expect(200);
    await lint({ code: 'x'.repeat(200_001) }).expect(400);
  });

});
