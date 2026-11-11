/**
 * Parsing a sprite literal into a grid, while remembering where every cell came
 * from in the source text.
 *
 * The offsets are the whole point. Blit edits a pixel by rewriting ONE
 * character in the sketch's source, so each row has to know the exact offset
 * (within the raw template literal) of the line it came from. Lose that and
 * click-to-paint becomes a guess.
 *
 * Offsets are recorded against the RAW literal, before dedenting, because that
 * is the text the editor holds. `indent` is how many characters to skip to
 * reach column 0.
 */

/** One row of a sprite, plus its provenance in the raw literal. */
export interface GridRow {
  /** Offset within the raw literal of this line's first character. */
  lineStart: number;
  /** Length of the ORIGINAL line, indentation included. */
  lineLength: number;
  /** The line with the common indentation removed. Column 0 is `text[0]`. */
  text: string;
}

export interface SpriteGrid {
  rows: GridRow[];
  /** Widest dedented row. A sprite's footprint is `width` x `height`. */
  width: number;
  height: number;
  /** Characters stripped from the front of every line. */
  indent: number;
}

const BLANK = /^\s*$/;

/**
 * Parse the contents of a `sprite(...)` template literal.
 *
 * Leading and trailing blank lines go away, so the idiomatic form
 *
 * ```
 * sprite(`
 *   .ww.
 *   wwww
 * `)
 * ```
 *
 * is a 4x2 sprite and not a 4x4 one with empty rows top and bottom. Interior
 * blank lines are KEPT: a gap in the middle of a sprite is deliberate.
 *
 * Indentation is stripped uniformly (the minimum across non-blank lines) so the
 * grid does not inherit the surrounding code's indentation. Ragged rows are
 * fine; short rows read as transparent out to `width`.
 */
export function parseSpriteGrid(raw: string): SpriteGrid {
  const lines: GridRow[] = [];
  let offset = 0;
  for (const line of raw.split('\n')) {
    lines.push({ lineStart: offset, lineLength: line.length, text: line });
    offset += line.length + 1; // + the '\n' that split consumed
  }

  // Trim blank lines from both ends, but never from the middle.
  let first = 0;
  let last = lines.length - 1;
  while (first <= last && BLANK.test(lines[first].text)) first += 1;
  while (last >= first && BLANK.test(lines[last].text)) last -= 1;
  const kept = lines.slice(first, last + 1);

  if (kept.length === 0) {
    return { rows: [], width: 0, height: 0, indent: 0 };
  }

  let indent = Infinity;
  for (const row of kept) {
    if (BLANK.test(row.text)) continue; // a blank row must not force indent to 0
    const leading = row.text.length - row.text.trimStart().length;
    if (leading < indent) indent = leading;
  }
  if (!Number.isFinite(indent)) indent = 0;

  const rows = kept.map((row) => ({
    lineStart: row.lineStart,
    lineLength: row.lineLength,
    // `trimEnd` so trailing whitespace does not inflate the sprite's width.
    text: row.text.slice(indent).trimEnd(),
  }));

  return {
    rows,
    width: rows.reduce((max, row) => Math.max(max, row.text.length), 0),
    height: rows.length,
    indent,
  };
}

/** The character at a cell, or `' '` (transparent) past the end of a short row. */
export function charAt(grid: SpriteGrid, col: number, row: number): string {
  const line = grid.rows[row];
  if (!line) return ' ';
  return col < line.text.length ? line.text[col] : ' ';
}

/** Every distinct character used in the grid, in first-seen order. */
export function charsUsed(grid: SpriteGrid): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const row of grid.rows) {
    for (const ch of row.text) {
      if (seen.has(ch)) continue;
      seen.add(ch);
      order.push(ch);
    }
  }
  return order;
}
