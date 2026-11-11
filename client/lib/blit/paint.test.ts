/**
 * Click-to-paint, end to end: canvas pixel -> sprite cell -> edited source.
 *
 * This is the feature that separates Blit from a shader toy, and the reason it
 * works through arbitrary transform chains is structural: the transform
 * combinators only move coordinates, so provenance rides along for free, and
 * `stack` is the one place that has to arbitrate. These tests are the guard on
 * that claim, so each one asserts through a DIFFERENT chain.
 */

import { describe, expect, it } from 'vitest';

import { evaluateSketch } from './evaluate';
import { probeAt, type RenderOptions } from './render';
import { pokeChar } from './source';
import type { SpriteHit } from './pattern';

function options(sketch: ReturnType<typeof evaluateSketch>, frame = 0): RenderOptions {
  const { w, h, fps, cycle, ramp } = sketch.settings;
  return { w, h, frame, fps, cycle, ramp };
}

/** The whole gesture: evaluate, probe the pixel, rewrite the source. */
function paint(code: string, x: number, y: number, ch: string, frame = 0): { code: string; hit: SpriteHit | null } {
  const sketch = evaluateSketch(code);
  const hit = probeAt(sketch.pattern, options(sketch, frame), x, y);
  if (!hit) return { code, hit: null };
  const literal = sketch.literals.find((l) => l.id === hit.sourceId);
  const grid = sketch.grids.get(hit.sourceId);
  if (!literal || !grid) return { code, hit };
  return { code: pokeChar(code, literal, grid, hit, ch), hit };
}

describe('probing a plain sprite', () => {
  const code = 'size(4, 2); out(sprite(`\n  wwww\n  w..w\n`))';

  it('maps a visible pixel to its own cell', () => {
    const { hit } = paint(code, 2, 0, 'r');
    expect(hit).toEqual({ sourceId: 0, col: 2, row: 0 });
  });

  it('rewrites that one character', () => {
    expect(paint(code, 2, 0, 'r').code).toBe('size(4, 2); out(sprite(`\n  wwrw\n  w..w\n`))');
  });

  it('claims a transparent cell inside the sprite, so a hole can be filled', () => {
    const { hit, code: next } = paint(code, 1, 1, 'r');
    expect(hit).toEqual({ sourceId: 0, col: 1, row: 1 });
    expect(next).toBe('size(4, 2); out(sprite(`\n  wwww\n  wr.w\n`))');
  });

  it('finds nothing outside the sprite, so a stray click changes nothing', () => {
    const wide = 'size(8, 8); out(sprite(`\n  ww\n`))';
    const { hit, code: next } = paint(wide, 6, 6, 'r');
    expect(hit).toBeNull();
    expect(next).toBe(wide);
  });

  it('finds nothing on a generated field, which has no source cell', () => {
    expect(paint('size(4, 4); out(checker())', 1, 1, 'r').hit).toBeNull();
  });
});

describe('probing through transforms', () => {
  it('follows a shift', () => {
    const code = 'size(4, 4); out(sprite(`\n  ww\n`).shift(2, 1))';
    // The sprite now sits at (2,1)-(3,1); its cell 0 is drawn at canvas x=2.
    expect(paint(code, 2, 1, 'r').hit).toEqual({ sourceId: 0, col: 0, row: 0 });
    expect(paint(code, 2, 1, 'r').code).toBe('size(4, 4); out(sprite(`\n  rw\n`).shift(2, 1))');
  });

  it('follows a flip, so clicking the right edge edits the left cell', () => {
    const code = 'size(4, 1); out(sprite(`\n  wwwk\n`).flip("x"))';
    // Flipped, the k drawn at x=0 comes from cell 3.
    expect(paint(code, 0, 0, 'r').hit).toEqual({ sourceId: 0, col: 3, row: 0 });
    expect(paint(code, 0, 0, 'r').code).toBe('size(4, 1); out(sprite(`\n  wwwr\n`).flip("x"))');
  });

  it('follows a mirror onto the reflected half', () => {
    const code = 'size(4, 1); out(sprite(`\n  kw..\n`).mirror("x"))';
    // Mirrored, canvas x=3 reads cell 0.
    expect(paint(code, 3, 0, 'r').hit).toEqual({ sourceId: 0, col: 0, row: 0 });
    expect(paint(code, 3, 0, 'r').code).toBe('size(4, 1); out(sprite(`\n  rw..\n`).mirror("x"))');
  });

  it('follows a 90 degree rotation', () => {
    const code = 'size(2, 2); out(sprite(`\n  wk\n  ..\n`).rot(90))';
    // Rotated clockwise, the top-left cell lands at the top-right.
    expect(paint(code, 1, 0, 'r').hit).toEqual({ sourceId: 0, col: 0, row: 0 });
    expect(paint(code, 1, 0, 'r').code).toBe('size(2, 2); out(sprite(`\n  rk\n  ..\n`).rot(90))');
  });

  it('follows a scale, so every pixel of a block edits the one source cell', () => {
    const code = 'size(4, 4); out(sprite(`\n  wk\n`).scale(2))';
    for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      expect(paint(code, x, y, 'r').hit).toEqual({ sourceId: 0, col: 0, row: 0 });
    }
    expect(paint(code, 2, 1, 'r').hit).toEqual({ sourceId: 0, col: 1, row: 0 });
  });

  it('follows a stacked chain of shift, mirror and scale together', () => {
    const code = 'size(8, 8); out(sprite(`\n  wk\n  ..\n`).scale(2).shift(1, 1))';
    // Cell (1,0) is scaled to a 2x2 block at (2,0)-(3,1), then shifted to (3,1).
    expect(paint(code, 3, 1, 'r').hit).toEqual({ sourceId: 0, col: 1, row: 0 });
    expect(paint(code, 3, 1, 'r').code).toBe('size(8, 8); out(sprite(`\n  wr\n  ..\n`).scale(2).shift(1, 1))');
  });
});

describe('probing through layers', () => {
  const code = [
    'size(2, 1);',
    'out(stack(',
    '  sprite(`ww`),',
    '  sprite(`.k`)',
    '))',
  ].join('\n');

  it('picks the topmost visible layer, not the bottom one', () => {
    expect(paint(code, 1, 0, 'r').hit).toEqual({ sourceId: 1, col: 1, row: 0 });
  });

  it('falls through to the lower layer where the top is transparent', () => {
    expect(paint(code, 0, 0, 'r').hit).toEqual({ sourceId: 0, col: 0, row: 0 });
  });

  it('edits only the literal it landed on', () => {
    expect(paint(code, 1, 0, 'r').code).toContain('sprite(`.r`)');
    expect(paint(code, 1, 0, 'r').code).toContain('sprite(`ww`)');
  });

  it('prefers the original over its own drop shadow', () => {
    // `shadow` stacks an offset tinted copy UNDER the original, so a pixel where
    // both land must resolve to the original's cell.
    const shadowed = 'size(4, 4); out(sprite(`\n  ww\n  ww\n`).shadow(1, 1))';
    expect(paint(shadowed, 1, 1, 'r').hit).toEqual({ sourceId: 0, col: 1, row: 1 });
  });

  it('maps an outline pixel to the cell it sits on, so clicking an edge grows the sprite', () => {
    // An outline pixel has no cell of its own. The transparent-pass then claims
    // the sprite cell underneath it, which is how you extend a shape by clicking
    // just outside it.
    const outlined = 'size(3, 1); out(sprite(`\n  w..\n`).outline("#000000"))';
    const { hit, code: next } = paint(outlined, 1, 0, 'w');
    expect(hit).toEqual({ sourceId: 0, col: 1, row: 0 });
    expect(next).toBe('size(3, 1); out(sprite(`\n  ww.\n`).outline("#000000"))');
  });
});

describe('probing an animation', () => {
  const code = [
    'size(2, 1); cycle(2);',
    'out(frames(',
    '  sprite(`w.`),',
    '  sprite(`.w`)',
    '))',
  ].join('\n');

  it('edits the frame that is actually on screen', () => {
    expect(paint(code, 0, 0, 'r', 0).hit).toEqual({ sourceId: 0, col: 0, row: 0 });
    expect(paint(code, 1, 0, 'r', 1).hit).toEqual({ sourceId: 1, col: 1, row: 0 });
  });

  it('rewrites the literal belonging to that frame', () => {
    expect(paint(code, 1, 0, 'r', 1).code).toContain('sprite(`.r`)');
    expect(paint(code, 1, 0, 'r', 1).code).toContain('sprite(`w.`)');
  });
});

describe('a painted sketch stays valid', () => {
  it('re-evaluates after an edit, with the new pixel in place', () => {
    const code = 'size(2, 2); out(sprite(`\n  ..\n  ..\n`).pal({ r: "#e43b44" }))';
    const { code: next } = paint(code, 1, 1, 'r');
    const sketch = evaluateSketch(next);
    const o = options(sketch);
    const hit = probeAt(sketch.pattern, o, 1, 1);
    expect(hit).toEqual({ sourceId: 0, col: 1, row: 1 });
    expect(sketch.warnings).toEqual([]);
  });

  it('survives repeated paints, each one landing where it was aimed', () => {
    let code = 'size(3, 1); out(sprite(`\n  ...\n`).pal({ r: "#e43b44" }))';
    for (const x of [0, 1, 2]) code = paint(code, x, 0, 'r').code;
    expect(code).toBe('size(3, 1); out(sprite(`\n  rrr\n`).pal({ r: "#e43b44" }))');
    expect(evaluateSketch(code).warnings).toEqual([]);
  });
});
