import { describe, expect, it } from 'vitest';

import { charAt, charsUsed, parseSpriteGrid } from './grid';

describe('parseSpriteGrid', () => {
  it('drops the blank lines the idiomatic literal form creates', () => {
    // This is what `sprite(`\n  .ww.\n  wwww\n`)` actually passes in.
    const grid = parseSpriteGrid('\n  .ww.\n  wwww\n');
    expect(grid.height).toBe(2);
    expect(grid.width).toBe(4);
    expect(grid.rows.map((r) => r.text)).toEqual(['.ww.', 'wwww']);
  });

  it('strips the common indentation and records how much it removed', () => {
    const grid = parseSpriteGrid('\n      ..#..\n      .###.\n');
    expect(grid.indent).toBe(6);
    expect(grid.rows[0].text).toBe('..#..');
  });

  it('keeps interior blank lines, which are deliberate gaps', () => {
    const grid = parseSpriteGrid('\n  ##\n\n  ##\n');
    expect(grid.height).toBe(3);
    expect(grid.rows[1].text).toBe('');
  });

  it('does not let a blank line collapse the indentation to zero', () => {
    const grid = parseSpriteGrid('\n    ##\n\n    ##\n');
    expect(grid.indent).toBe(4);
  });

  it('records each row offset against the raw literal, indentation included', () => {
    const raw = '\n  ab\n  cd\n';
    const grid = parseSpriteGrid(raw);
    // Row 0 starts after the leading newline; row 1 after "  ab\n".
    expect(grid.rows[0].lineStart).toBe(1);
    expect(grid.rows[1].lineStart).toBe(6);
    expect(raw[grid.rows[0].lineStart + grid.indent]).toBe('a');
    expect(raw[grid.rows[1].lineStart + grid.indent]).toBe('c');
  });

  it('keeps the original line length so a paint can pad a short row', () => {
    const grid = parseSpriteGrid('\n  ab\n  abcd\n');
    expect(grid.rows[0].lineLength).toBe(4); // "  ab"
    expect(grid.rows[1].lineLength).toBe(6); // "  abcd"
  });

  it('takes width from the widest row and reads short rows as transparent', () => {
    const grid = parseSpriteGrid('\n  ab\n  abcd\n');
    expect(grid.width).toBe(4);
    expect(charAt(grid, 3, 1)).toBe('d');
    expect(charAt(grid, 3, 0)).toBe(' ');
  });

  it('ignores trailing whitespace when measuring width', () => {
    const grid = parseSpriteGrid('\n  ab    \n  cd\n');
    expect(grid.width).toBe(2);
  });

  it('survives an empty literal', () => {
    const grid = parseSpriteGrid('\n   \n');
    expect(grid).toMatchObject({ height: 0, width: 0, rows: [] });
  });

  it('lists the characters in play in first-seen order', () => {
    expect(charsUsed(parseSpriteGrid('\n.ab\nba.\n'))).toEqual(['.', 'a', 'b']);
  });
});
