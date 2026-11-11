/**
 * The bridge from a pixel back to the character that drew it.
 *
 * This is the file that makes Blit a tool rather than a demo. Code is a terrible
 * brush, so clicking the canvas has to edit the source, and to do that we need
 * two things:
 *
 *   1. Every `sprite(...)` literal located in the ORIGINAL text, with exact
 *      offsets. That is `scanSpriteLiterals`.
 *   2. A rewrite that tags each of those calls with its index, so the pattern it
 *      builds can report provenance at sample time. Same function.
 *
 * The scanner is a small lexer rather than a regex because `sprite(` appears
 * inside comments and strings in real sketches, and matching those would write
 * an edit into the middle of a comment.
 */

import type { SpriteGrid } from './grid';
import type { SpriteHit } from './pattern';

export interface SpriteLiteral {
  /** Index of this literal in the sketch. Matches `SpriteHit.sourceId`. */
  id: number;
  /** Offset in the original source of the first character after the backtick. */
  contentStart: number;
  /** Offset of the closing backtick. */
  contentEnd: number;
  /** The literal's contents, verbatim. */
  raw: string;
}

/**
 * One `blit(` call in the source: a placed sketch, which scene mode can pick up
 * and drag. Every call is tagged, whatever its arguments, because the instance
 * has to be selectable even when its position is computed; whether it can be
 * MOVED is a separate question `sceneEdit.ts` answers from the arguments.
 */
export interface BlitCall {
  /** Index of this call in the sketch. Matches `BlitInstance.id`. */
  id: number;
  /** Offset of the `b` of `blit` in the original source. */
  start: number;
  /** Offset of the opening parenthesis. */
  open: number;
}

export interface ScanResult {
  literals: SpriteLiteral[];
  blits: BlitCall[];
  /**
   * The source with tagged `sprite(` calls rewritten to `__spriteAt(<id>, ` and
   * `blit(` calls to `__blitAt(<id>, `.
   */
  code: string;
}

const IDENT = /[A-Za-z0-9_$]/;

/** Index just past the closing backtick of the template literal starting at `start`. */
function endOfTemplate(code: string, start: number): number {
  let i = start + 1;
  while (i < code.length) {
    const ch = code[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === '`') return i;
    if (ch === '$' && code[i + 1] === '{') {
      // Walk the interpolation, which may itself contain braces and templates.
      let depth = 1;
      i += 2;
      while (i < code.length && depth > 0) {
        const c = code[i];
        if (c === '{') depth += 1;
        else if (c === '}') depth -= 1;
        else if (c === '`') i = endOfTemplate(code, i);
        i += 1;
      }
      continue;
    }
    i += 1;
  }
  return -1;
}

/**
 * Find every `sprite(\`...\`)` call and tag it.
 *
 * A literal that interpolates (`${...}`) is left alone: its characters no longer
 * map to fixed offsets, so painting into it would corrupt the source. It still
 * renders, it just is not clickable.
 */
export function scanSpriteLiterals(code: string): ScanResult {
  const literals: SpriteLiteral[] = [];
  const blits: BlitCall[] = [];
  const rewrites: Array<{ from: number; to: number; text: string }> = [];

  let i = 0;
  while (i < code.length) {
    const ch = code[i];

    // Skip the places a `sprite(` match would be a false positive.
    if (ch === '/' && code[i + 1] === '/') {
      const nl = code.indexOf('\n', i);
      i = nl === -1 ? code.length : nl;
      continue;
    }
    if (ch === '/' && code[i + 1] === '*') {
      const close = code.indexOf('*/', i + 2);
      i = close === -1 ? code.length : close + 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      i += 1;
      while (i < code.length && code[i] !== ch) i += code[i] === '\\' ? 2 : 1;
      i += 1;
      continue;
    }
    if (ch === '`') {
      const end = endOfTemplate(code, i);
      i = end === -1 ? code.length : end + 1;
      continue;
    }

    if (!IDENT.test(ch)) {
      i += 1;
      continue;
    }

    // An identifier. Read it whole so `mySprite(` never matches `sprite(`.
    const identStart = i;
    while (i < code.length && IDENT.test(code[i])) i += 1;
    const ident = code.slice(identStart, i);
    if (ident !== 'sprite' && ident !== 'blit') continue;
    if (identStart > 0 && code[identStart - 1] === '.') continue; // a method, not ours

    let j = i;
    while (j < code.length && /\s/.test(code[j])) j += 1;
    if (code[j] !== '(') continue;
    const paren = j;

    if (ident === 'blit') {
      // `__blitAt(0, )` for a bare `blit()` is still valid JavaScript: a
      // trailing comma in a call has been legal since ES2017, so the call fails
      // in the language's own words rather than as a syntax error nobody wrote.
      const id = blits.length;
      blits.push({ id, start: identStart, open: paren });
      rewrites.push({ from: identStart, to: paren + 1, text: `__blitAt(${id}, ` });
      i = paren + 1;
      continue;
    }

    j += 1;
    while (j < code.length && /\s/.test(code[j])) j += 1;
    if (code[j] !== '`') continue;

    const contentStart = j + 1;
    const contentEnd = endOfTemplate(code, j);
    if (contentEnd === -1) continue;

    const raw = code.slice(contentStart, contentEnd);
    i = contentEnd + 1;

    if (raw.includes('${')) continue; // renders, but offsets are not stable

    const id = literals.length;
    literals.push({ id, contentStart, contentEnd, raw });
    rewrites.push({ from: identStart, to: paren + 1, text: `__spriteAt(${id}, ` });
  }

  let out = '';
  let cursor = 0;
  for (const r of rewrites) {
    out += code.slice(cursor, r.from) + r.text;
    cursor = r.to;
  }
  out += code.slice(cursor);

  return { literals, blits, code: out };
}

/**
 * Rewrite one character of one sprite literal: the paint stroke.
 *
 * Painting past the end of a short row pads it out first, so clicking the empty
 * right-hand side of a ragged sprite does what it looks like it does. A line
 * shorter than the grid's indentation is padded with spaces up to the indent
 * before any cells, because padding it with `.` instead would reset the grid's
 * common indentation and shift every other row.
 */
export function pokeChar(
  code: string,
  literal: SpriteLiteral,
  grid: SpriteGrid,
  hit: SpriteHit,
  ch: string,
): string {
  const row = grid.rows[hit.row];
  if (!row || hit.col < 0) return code;

  const rowStart = literal.contentStart + row.lineStart;
  const target = grid.indent + hit.col;

  if (target < row.lineLength) {
    const at = rowStart + target;
    return code.slice(0, at) + ch + code.slice(at + 1);
  }

  const pad =
    row.lineLength < grid.indent
      ? ' '.repeat(grid.indent - row.lineLength) + '.'.repeat(target - grid.indent)
      : '.'.repeat(target - row.lineLength);
  const at = rowStart + row.lineLength;
  return code.slice(0, at) + pad + ch + code.slice(at);
}

/** The character currently at a hit, so the UI can show or toggle it. */
export function charAtHit(grid: SpriteGrid, hit: SpriteHit): string {
  const row = grid.rows[hit.row];
  if (!row) return ' ';
  return hit.col < row.text.length ? row.text[hit.col] : ' ';
}
