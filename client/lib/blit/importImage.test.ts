import { describe, expect, it } from 'vitest';

import { alpha, parseColor, blue, green, red } from './color';
import { evaluateSketch } from './evaluate';
import { parseSpriteGrid } from './grid';
import {
  IMPORT_MAX_COLORS,
  IMPORT_MAX_SIDE,
  IMPORT_WARN_COLORS,
  IMPORT_WARN_SIDE,
  importRgba,
  sketchSource,
  spriteExpression,
  type ImportedSprite,
} from './importImage';
import { LETTERS } from './palettes';
import { renderToRgba } from './render';

/** `n` distinct opaque colours, all near black so none of them can borrow a letter. */
function shades(n: number): number[] {
  return Array.from({ length: n }, (_, i) => (((i << 8) | 0xff) >>> 0));
}

/** Build an RGBA buffer from a grid of colour words. `null` is fully transparent. */
function rgbaOf(pixels: (number | null)[][]): { data: Uint8ClampedArray; w: number; h: number } {
  const h = pixels.length;
  const w = pixels[0].length;
  const data = new Uint8ClampedArray(w * h * 4);
  let i = 0;
  for (const row of pixels) {
    for (const c of row) {
      const color = c ?? 0;
      data[i] = red(color);
      data[i + 1] = green(color);
      data[i + 2] = blue(color);
      data[i + 3] = alpha(color);
      i += 4;
    }
  }
  return { data, w, h };
}

/**
 * Alpha 0 carries no colour, so a fully transparent pixel's RGB is not
 * information and is not compared. Everything else is compared byte for byte.
 */
function normalized(data: Uint8ClampedArray): number[] {
  const out: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) out.push(0, 0, 0, 0);
    else out.push(data[i], data[i + 1], data[i + 2], data[i + 3]);
  }
  return out;
}

const ok = (outcome: ReturnType<typeof importRgba>): ImportedSprite => {
  if (!outcome.ok) throw new Error(`expected an import, got: ${outcome.reason}`);
  return outcome.sprite;
};

const W = parseColor('#ffffff');
const K = parseColor('#000000');
const RED = parseColor('#e43b44');
const HALF = parseColor('#3b5dc980');

describe('importRgba: the grid it emits', () => {
  it('uses `.` for every fully transparent pixel', () => {
    const { data, w, h } = rgbaOf([
      [null, W],
      [W, null],
    ]);
    const sprite = ok(importRgba(data, w, h));
    expect(sprite.rows).toEqual(['.w', 'w.']);
  });

  it('keeps the footprint even when an edge row or column is empty', () => {
    // `.` is not whitespace, so the grid parser neither trims it off the end of a
    // row nor treats an all-transparent row as a blank line to drop. Emitting
    // spaces instead would silently shrink the sprite.
    const { data, w, h } = rgbaOf([
      [W, null, null],
      [null, null, null],
    ]);
    const sprite = ok(importRgba(data, w, h));
    expect(sprite.rows).toEqual(['w..', '...']);
    expect([sprite.width, sprite.height]).toEqual([3, 2]);
    const grid = parseSpriteGrid(`\n  ${sprite.rows.join('\n  ')}\n`);
    expect([grid.width, grid.height]).toEqual([3, 2]);
  });

  it('prefers the letter mnemonic when a colour is close to one', () => {
    const { data, w, h } = rgbaOf([[W, K, RED]]);
    const sprite = ok(importRgba(data, w, h));
    expect(sprite.rows).toEqual(['wkr']);
  });

  it('binds a mnemonic explicitly when the colour is only near, not equal', () => {
    // #c0cbdc is close to `l` (#b8b8b8) but is not it. The letter is the one a
    // person would read; the binding is what makes the picture right.
    const { data, w, h } = rgbaOf([[parseColor('#c0cbdc')]]);
    const sprite = ok(importRgba(data, w, h));
    expect(sprite.rows).toEqual(['l']);
    expect(sprite.bindings).toEqual([['l', '#c0cbdc']]);
  });

  it('leaves a mnemonic unbound when the colour is exactly its default', () => {
    const { data, w, h } = rgbaOf([[W, RED]]);
    const sprite = ok(importRgba(data, w, h));
    expect(sprite.bindings).toEqual([]);
  });

  it('never gives a mnemonic to a colour that is not opaque', () => {
    // A half-transparent blue is not `i`, however close the hue is.
    const { data, w, h } = rgbaOf([[HALF]]);
    const sprite = ok(importRgba(data, w, h));
    expect(Object.keys(LETTERS)).not.toContain(sprite.rows[0]);
    expect(sprite.bindings).toEqual([[sprite.rows[0], '#3b5dc980']]);
  });

  it('gives each distinct colour its own character, in the order they appear', () => {
    const a = parseColor('#112233');
    const b = parseColor('#445566');
    const { data, w, h } = rgbaOf([
      [b, a],
      [a, b],
    ]);
    const sprite = ok(importRgba(data, w, h));
    expect(sprite.colors).toBe(2);
    expect(sprite.bindings.map(([, css]) => css)).toEqual(['#445566', '#112233']);
    expect(new Set(sprite.rows.join(''))).toEqual(new Set(sprite.bindings.map(([ch]) => ch)));
  });

  it('emits nothing a template literal cannot hold', () => {
    const { data, w, h } = rgbaOf([shades(30)]);
    const sprite = ok(importRgba(data, w, h));
    for (const ch of sprite.rows.join('')) {
      expect(ch, `character ${JSON.stringify(ch)}`).toMatch(/^[A-Za-z.]$/);
    }
  });
});

describe('importRgba: it refuses what it should not emit', () => {
  it('refuses an image wider or taller than the limit, naming the size', () => {
    const big = new Uint8ClampedArray((IMPORT_MAX_SIDE + 1) * 4);
    const outcome = importRgba(big, IMPORT_MAX_SIDE + 1, 1);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toContain(`${IMPORT_MAX_SIDE + 1}`);
      expect(outcome.reason).toContain(`${IMPORT_MAX_SIDE}`);
    }
  });

  it('accepts an image exactly at the limit', () => {
    const side = IMPORT_MAX_SIDE;
    const data = new Uint8ClampedArray(side * side * 4);
    for (let i = 3; i < data.length; i += 4) data[i] = 255;
    expect(importRgba(data, side, side).ok).toBe(true);
  });

  it('refuses more colours than a sprite grid can usefully hold, and says how many', () => {
    const pixels = shades(IMPORT_MAX_COLORS + 1);
    const { data, w, h } = rgbaOf([pixels]);
    expect(new Set(pixels).size).toBe(IMPORT_MAX_COLORS + 1);
    const outcome = importRgba(data, w, h);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toContain(`${IMPORT_MAX_COLORS + 1}`);
  });

  it('accepts exactly as many colours as it has characters for', () => {
    // Near-black blues: at most one can borrow `k`, so this runs the fallback
    // pool right to its end. The cap is the pool's size for exactly this reason.
    const { data, w, h } = rgbaOf([shades(IMPORT_MAX_COLORS)]);
    const sprite = ok(importRgba(data, w, h));
    expect(sprite.colors).toBe(IMPORT_MAX_COLORS);
    expect(new Set(sprite.rows.join('')).size).toBe(IMPORT_MAX_COLORS);
  });

  it('refuses an empty image rather than emitting an empty literal', () => {
    expect(importRgba(new Uint8ClampedArray(0), 0, 0).ok).toBe(false);
  });

  it('refuses a buffer that is not the size the dimensions claim', () => {
    expect(importRgba(new Uint8ClampedArray(12), 4, 4).ok).toBe(false);
  });

  it('warns rather than refuses at the sizes that merely get awkward', () => {
    const side = IMPORT_WARN_SIDE + 1;
    const data = new Uint8ClampedArray(side * side * 4);
    for (let i = 3; i < data.length; i += 4) data[i] = 255;
    const sprite = ok(importRgba(data, side, side));
    expect(sprite.warnings.join(' ')).toContain(`${side}`);
  });

  it('warns when the palette is long enough to be worth trimming', () => {
    const count = IMPORT_WARN_COLORS + 1;
    const pixels = shades(count);
    const { data, w, h } = rgbaOf([pixels]);
    const sprite = ok(importRgba(data, w, h));
    expect(sprite.colors).toBe(count);
    expect(sprite.warnings.join(' ')).toContain(`${count}`);
  });
});

describe('importRgba: the source it emits', () => {
  const fixture = rgbaOf([
    [null, W, W, null],
    [W, parseColor('#c0cbdc'), parseColor('#c0cbdc'), W],
    [null, HALF, HALF, null],
  ]);

  it('emits an expression that evaluates back to the same picture', () => {
    const sprite = ok(importRgba(fixture.data, fixture.w, fixture.h));
    const evaluated = evaluateSketch(spriteExpression(sprite));
    const rendered = renderToRgba(evaluated.pattern, {
      w: fixture.w,
      h: fixture.h,
      frame: 0,
      fps: 12,
      cycle: 8,
    });
    expect(normalized(rendered)).toEqual(normalized(fixture.data));
  });

  it('emits a whole sketch that evaluates back to the same picture, at the right size', () => {
    const sprite = ok(importRgba(fixture.data, fixture.w, fixture.h));
    const evaluated = evaluateSketch(sketchSource(sprite));
    expect(evaluated.settings.w).toBe(fixture.w);
    expect(evaluated.settings.h).toBe(fixture.h);
    const rendered = renderToRgba(evaluated.pattern, { ...evaluated.settings, frame: 0 });
    expect(normalized(rendered)).toEqual(normalized(fixture.data));
  });

  it('round-trips a picture that uses every character it can reach', () => {
    const colors = shades(IMPORT_MAX_COLORS);
    const { data, w, h } = rgbaOf([colors, [...colors].reverse()]);
    const sprite = ok(importRgba(data, w, h));
    const evaluated = evaluateSketch(sketchSource(sprite));
    const rendered = renderToRgba(evaluated.pattern, { ...evaluated.settings, frame: 0 });
    expect(normalized(rendered)).toEqual(normalized(data));
  });

  it('emits source a person can read', () => {
    const sprite = ok(importRgba(fixture.data, fixture.w, fixture.h));
    const source = sketchSource(sprite);
    expect(source).toContain('size(4, 3);');
    expect(source).toContain('out(sprite(`');
    expect(source).toContain('.pal({');
    // The grid is indented inside the literal, the way every example is.
    expect(source).toMatch(/\n {2}\.ww\.\n/);
    // No trailing whitespace anywhere: the grid parser trims it, so leaving it
    // in means the file and the sprite disagree about the sprite's width.
    for (const line of source.split('\n')) expect(line).toBe(line.trimEnd());
  });

  it('is clickable source: the literal is a plain template with no interpolation', () => {
    const sprite = ok(importRgba(fixture.data, fixture.w, fixture.h));
    const source = sketchSource(sprite);
    expect(source).not.toContain('${');
    expect(evaluateSketch(source).literals).toHaveLength(1);
  });

  it('emits one binding per line once the palette stops fitting on one', () => {
    const { data, w, h } = rgbaOf([shades(12)]);
    const sprite = ok(importRgba(data, w, h));
    const source = spriteExpression(sprite);
    // 12 colours, 11 bindings: the first shade is #000000, which is exactly what
    // `k` already means, so it is the one character that needs no entry.
    expect(sprite.colors).toBe(12);
    expect(source.split('\n').filter((l) => /^\s+\w+: '#/.test(l))).toHaveLength(11);
  });

  it('omits .pal() entirely when every colour is already a mnemonic', () => {
    const { data, w, h } = rgbaOf([[W, K, RED]]);
    const source = spriteExpression(ok(importRgba(data, w, h)));
    expect(source).not.toContain('.pal(');
    expect(evaluateSketch(source).warnings).toEqual([]);
  });
});
