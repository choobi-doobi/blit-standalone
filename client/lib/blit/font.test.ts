import { describe, expect, it } from 'vitest';

import { TRANSPARENT, parseColor } from './color';
import { FONTS, FONT_NAMES, resolveFont, text, type Font, type FontName } from './font';
import { makeCtx } from './render';
import type { Pat } from './pattern';

const ctx = makeCtx({ w: 64, h: 64, frame: 0, fps: 12, cycle: 8 });

/** The text's own pixels, as a picture, so an assertion can be read as one. */
function picture(pat: Pat): string[] {
  const rows: string[] = [];
  for (let y = 0; y < (pat.h ?? 0); y += 1) {
    let row = '';
    for (let x = 0; x < (pat.w ?? 0); x += 1) row += pat.at(x, y, ctx) === TRANSPARENT ? '.' : '#';
    rows.push(row);
  }
  return rows;
}

const PRINTABLE: string[] = [];
for (let code = 0x20; code <= 0x7e; code += 1) PRINTABLE.push(String.fromCharCode(code));

describe('the glyph tables', () => {
  it.each(FONT_NAMES)('%s is made of rows that fit its cell', (name: FontName) => {
    const font: Font = FONTS[name];
    for (const [ch, spec] of Object.entries(font.glyphs)) {
      const rows = spec.split('/');
      expect(rows.length, `${name} '${ch}' has more rows than the cell is tall`).toBeLessThanOrEqual(font.height);
      for (const row of rows) {
        expect(row, `${name} '${ch}' has a row of something other than # and .`).toMatch(/^[#.]*$/);
      }
      // Ragged rows are allowed (short rows read as transparent), but a glyph
      // whose rows disagree by more than a couple of pixels is a typo, not a shape.
      const widths = rows.map((row) => row.length);
      expect(Math.max(...widths) - Math.min(...widths), `${name} '${ch}' has ragged rows`).toBeLessThanOrEqual(5);
    }
  });

  it('covers every printable ASCII character in 5x7', () => {
    const missing = PRINTABLE.filter((ch) => FONTS['5x7'].glyphs[ch] === undefined);
    expect(missing).toEqual([]);
  });

  /**
   * 3x5 has no lowercase by design, so the only characters it may be missing
   * are the lowercase letters — everything else printable has to be there.
   */
  it('covers every printable ASCII character in 3x5 except lowercase', () => {
    const missing = PRINTABLE.filter((ch) => FONTS['3x5'].glyphs[ch] === undefined);
    expect(missing.join('')).toBe('abcdefghijklmnopqrstuvwxyz');
  });

  it('draws a lowercase letter with its capital when the font has no lowercase', () => {
    expect(picture(text('abc'))).toEqual(picture(text('ABC')));
  });

  it('really does distinguish them in 5x7', () => {
    expect(picture(text('a', { font: '5x7' }))).not.toEqual(picture(text('A', { font: '5x7' })));
  });
});

describe('the box text reports', () => {
  it('is the ink, not the cell: I advances one pixel and M five', () => {
    expect(text('I').w).toBe(1);
    expect(text('M').w).toBe(5);
    // H(3) + gap(1) + I(1)
    expect(text('HI').w).toBe(5);
    expect(text('HI').h).toBe(5);
  });

  it('grows by the gap between glyphs, and only between them', () => {
    expect(text('HH', { gap: 0 }).w).toBe(6);
    expect(text('HH', { gap: 1 }).w).toBe(7);
    expect(text('HH', { gap: 3 }).w).toBe(9);
  });

  it('stacks lines with the line spacing, not the glyph gap', () => {
    expect(text('A\nB').h).toBe(11); // 5 + 1 + 5
    expect(text('A\nB', { line: 0 }).h).toBe(10);
    expect(text('A\nB', { line: 4 }).h).toBe(14);
    expect(text('A\nMM').w).toBe(11); // the widest line wins
  });

  it('is empty for an empty string, rather than a one-pixel box', () => {
    const empty = text('');
    expect([empty.w, empty.h]).toEqual([0, 0]);
    expect(empty.at(0, 0, ctx)).toBe(TRANSPARENT);
  });
});

describe('what text draws', () => {
  it('draws the glyph in the table', () => {
    expect(picture(text('T'))).toEqual(['###', '.#.', '.#.', '.#.', '.#.']);
  });

  it('puts the gap between two glyphs and nothing in it', () => {
    expect(picture(text('II'))).toEqual(['#.#', '#.#', '#.#', '#.#', '#.#']);
  });

  it('hangs a descender below the baseline in 5x7, and only on the letters that have one', () => {
    const below = (ch: string): boolean =>
      picture(text(ch, { font: '5x7' }))
        .slice(5)
        .some((row) => row.includes('#'));
    expect(below('p')).toBe(true);
    expect(below('y')).toBe(true);
    expect(below('o')).toBe(false);
    expect(below('P')).toBe(false);
  });

  it('draws a block for a character the font has never heard of', () => {
    // A solid block is what no real glyph looks like, which is the point: a
    // missing character has to be visible as missing.
    expect(picture(text('€'))).toEqual(['###', '###', '###', '###', '###']);
  });

  it('aligns short lines against the longest one', () => {
    expect(picture(text('I\nMM', { align: 'left' })).map((row) => row.indexOf('#'))[0]).toBe(0);
    expect(picture(text('I\nMM', { align: 'right' })).map((row) => row.indexOf('#'))[0]).toBe(10);
    expect(picture(text('I\nMM', { align: 'center' })).map((row) => row.indexOf('#'))[0]).toBe(5);
  });
});

describe('the colour', () => {
  it('is white by default', () => {
    expect(text('I').at(0, 0, ctx)).toBe(parseColor('#ffffff'));
  });

  it('takes a colour positionally, like rect() and circle()', () => {
    expect(text('I', '#e43b44').at(0, 0, ctx)).toBe(parseColor('#e43b44'));
  });

  it('takes one in the options too, so a call can name everything it sets', () => {
    expect(text('I', { color: '#41a6f6', font: '5x7' }).at(0, 0, ctx)).toBe(parseColor('#41a6f6'));
  });

  it('leaves the unlit pixels transparent rather than filling the box', () => {
    expect(text('T', '#ffffff').at(0, 1, ctx)).toBe(TRANSPARENT);
  });
});

describe('the font name', () => {
  it('resolves the built-in fonts', () => {
    expect(resolveFont('3x5').height).toBe(5);
    expect(resolveFont('5x7').height).toBe(7);
  });

  it('throws with the list when it is a typo, like ramp() does', () => {
    expect(() => resolveFont('5x8')).toThrow(/Unknown font: 5x8\. Try 3x5, 5x7\./);
    expect(() => text('HI', { font: '3x6' as FontName })).toThrow(/Unknown font/);
  });
});
