import { describe, expect, it } from 'vitest';

import { parseSpriteGrid } from './grid';
import { charAtHit, pokeChar, scanSpriteLiterals } from './source';

describe('scanSpriteLiterals', () => {
  it('finds a literal and tags the call with its index', () => {
    const code = 'sprite(`\n  ab\n`)';
    const { literals, code: rewritten } = scanSpriteLiterals(code);
    expect(literals).toHaveLength(1);
    expect(literals[0].raw).toBe('\n  ab\n');
    expect(rewritten).toBe('__spriteAt(0, `\n  ab\n`)');
  });

  it('numbers several literals in source order', () => {
    const { literals, code } = scanSpriteLiterals('stack(sprite(`a`), sprite(`b`))');
    expect(literals.map((l) => l.raw)).toEqual(['a', 'b']);
    expect(code).toBe('stack(__spriteAt(0, `a`), __spriteAt(1, `b`))');
  });

  it('points contentStart at the first character after the backtick', () => {
    const code = 'x = sprite(`ab`)';
    const { literals } = scanSpriteLiterals(code);
    expect(code[literals[0].contentStart]).toBe('a');
    expect(code[literals[0].contentEnd]).toBe('`');
  });

  it('tolerates whitespace between the name, the paren and the backtick', () => {
    const { literals } = scanSpriteLiterals('sprite (\n  `ab`\n)');
    expect(literals).toHaveLength(1);
    expect(literals[0].raw).toBe('ab');
  });

  it('ignores a mention inside a line comment', () => {
    const { literals, code } = scanSpriteLiterals('// sprite(`nope`)\nsprite(`yes`)');
    expect(literals.map((l) => l.raw)).toEqual(['yes']);
    expect(code).toContain('// sprite(`nope`)');
  });

  it('ignores a mention inside a block comment', () => {
    const { literals } = scanSpriteLiterals('/* sprite(`nope`) */ sprite(`yes`)');
    expect(literals.map((l) => l.raw)).toEqual(['yes']);
  });

  it('ignores a mention inside a quoted string, escapes included', () => {
    const { literals } = scanSpriteLiterals('const s = "sprite(`no`)"; const t = \'a\\\'sprite(`no`)\'; sprite(`yes`)');
    expect(literals.map((l) => l.raw)).toEqual(['yes']);
  });

  it('ignores a mention inside an unrelated template literal', () => {
    const { literals } = scanSpriteLiterals('const s = `sprite(\\`no\\`)`; sprite(`yes`)');
    expect(literals.map((l) => l.raw)).toEqual(['yes']);
  });

  it('does not match an identifier that merely ends in sprite', () => {
    const { literals, code } = scanSpriteLiterals('mysprite(`no`); sprite(`yes`)');
    expect(literals.map((l) => l.raw)).toEqual(['yes']);
    expect(code).toContain('mysprite(`no`)');
  });

  it('does not match a method call named sprite', () => {
    const { literals } = scanSpriteLiterals('lib.sprite(`no`); sprite(`yes`)');
    expect(literals.map((l) => l.raw)).toEqual(['yes']);
  });

  it('does not match sprite called with something other than a literal', () => {
    const { literals, code } = scanSpriteLiterals('sprite(art); sprite(`yes`)');
    expect(literals.map((l) => l.raw)).toEqual(['yes']);
    expect(code).toContain('sprite(art)');
  });

  it('leaves an interpolating literal untagged, because its offsets are not stable', () => {
    const { literals, code } = scanSpriteLiterals('sprite(`${row}`)');
    expect(literals).toEqual([]);
    // It still renders, it just is not clickable.
    expect(code).toBe('sprite(`${row}`)');
  });

  it('skips past an interpolation containing braces and nested templates', () => {
    const { literals } = scanSpriteLiterals('sprite(`${ {a: `x`} }`); sprite(`yes`)');
    expect(literals.map((l) => l.raw)).toEqual(['yes']);
  });
});

describe('pokeChar', () => {
  const code = 'sprite(`\n  ab\n  cd\n`)';
  const { literals } = scanSpriteLiterals(code);
  const literal = literals[0];
  const grid = parseSpriteGrid(literal.raw);

  it('replaces exactly one character, leaving everything else byte for byte', () => {
    const next = pokeChar(code, literal, grid, { sourceId: 0, col: 1, row: 0 }, 'Z');
    expect(next).toBe('sprite(`\n  aZ\n  cd\n`)');
    expect(next).toHaveLength(code.length);
  });

  it('edits the right row', () => {
    expect(pokeChar(code, literal, grid, { sourceId: 0, col: 0, row: 1 }, 'Z')).toBe('sprite(`\n  ab\n  Zd\n`)');
  });

  it('pads a short row out to the column before painting', () => {
    const ragged = 'sprite(`\n  ab\n  abcd\n`)';
    const lit = scanSpriteLiterals(ragged).literals[0];
    const g = parseSpriteGrid(lit.raw);
    // Column 3 of row 0, which only has two cells.
    expect(pokeChar(ragged, lit, g, { sourceId: 0, col: 3, row: 0 }, 'Z')).toBe('sprite(`\n  ab.Z\n  abcd\n`)');
  });

  it('pads an interior blank row with spaces up to the indent, not with cells', () => {
    // Padding with dots instead would reset the grid's common indentation and
    // shift every other row by two.
    const gapped = 'sprite(`\n  ab\n\n  cd\n`)';
    const lit = scanSpriteLiterals(gapped).literals[0];
    const g = parseSpriteGrid(lit.raw);
    const next = pokeChar(gapped, lit, g, { sourceId: 0, col: 1, row: 1 }, 'Z');
    expect(next).toBe('sprite(`\n  ab\n  .Z\n  cd\n`)');
    // The grid still has the same indentation and width after the edit.
    const reparsed = parseSpriteGrid(scanSpriteLiterals(next).literals[0].raw);
    expect(reparsed.indent).toBe(2);
    expect(reparsed.rows.map((r) => r.text)).toEqual(['ab', '.Z', 'cd']);
  });

  it('overwrites trailing whitespace in place rather than appending', () => {
    const padded = 'sprite(`\n  ab  \n`)';
    const lit = scanSpriteLiterals(padded).literals[0];
    const g = parseSpriteGrid(lit.raw);
    const next = pokeChar(padded, lit, g, { sourceId: 0, col: 2, row: 0 }, 'Z');
    expect(next).toBe('sprite(`\n  abZ \n`)');
  });

  it('is a no-op for a row that does not exist or a negative column', () => {
    expect(pokeChar(code, literal, grid, { sourceId: 0, col: 0, row: 9 }, 'Z')).toBe(code);
    expect(pokeChar(code, literal, grid, { sourceId: 0, col: -1, row: 0 }, 'Z')).toBe(code);
  });

  it('edits the second literal without disturbing the first', () => {
    const two = 'stack(sprite(`ab`), sprite(`cd`))';
    const lits = scanSpriteLiterals(two).literals;
    const g = parseSpriteGrid(lits[1].raw);
    expect(pokeChar(two, lits[1], g, { sourceId: 1, col: 0, row: 0 }, 'Z')).toBe('stack(sprite(`ab`), sprite(`Zd`))');
  });
});

describe('charAtHit', () => {
  const grid = parseSpriteGrid('\n  ab\n');

  it('reports the character under a hit', () => {
    expect(charAtHit(grid, { sourceId: 0, col: 1, row: 0 })).toBe('b');
  });

  it('reports a space past the end of a short row', () => {
    expect(charAtHit(grid, { sourceId: 0, col: 5, row: 0 })).toBe(' ');
    expect(charAtHit(grid, { sourceId: 0, col: 0, row: 9 })).toBe(' ');
  });
});

describe('blit( calls', () => {
  it('tags every call, in source order, whatever its arguments', () => {
    const code = "scene(blit('Coin', 1, 2), sprite(`w`), blit(id))";
    const scanned = scanSpriteLiterals(code);
    expect(scanned.blits.map((b) => [b.id, code.slice(b.start, b.open + 1)])).toEqual([
      [0, 'blit('],
      [1, 'blit('],
    ]);
    expect(scanned.code).toBe("scene(__blitAt(0, 'Coin', 1, 2), __spriteAt(0, `w`), __blitAt(1, id))");
  });

  it('leaves comments, strings and methods alone', () => {
    const code = "// blit('A')\nconst s = 'blit(x)'; p.blit(1); myblit(2);";
    const scanned = scanSpriteLiterals(code);
    expect(scanned.blits).toEqual([]);
    expect(scanned.code).toBe(code);
  });
});
