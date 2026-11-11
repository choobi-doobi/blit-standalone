/**
 * Text, as a pattern.
 *
 * Before this existed, putting a word on a canvas meant drawing every letter as
 * a sprite literal by hand — roughly thirty-six grids before you could write
 * "GAME OVER". That is exactly the kind of mechanical work the rest of the
 * language refuses to make you do, so the glyphs live here instead.
 *
 * `text()` is an ordinary constructor: it answers a `Pat` with a box, so it
 * stacks, centres, outlines, tints and animates like anything else. What it is
 * NOT is a sprite literal — the pixels have no home in the source text, so a
 * click on them paints nothing, the same as `circle()` or `grad()`.
 *
 * ## Why two fonts
 *
 * The default canvas is 32x32. A 5-wide font fits five characters across it, so
 * a caps-only 3x5 is the one that can actually write a word on a sprite, and it
 * is the default for that reason. `5x7` is the one with real lowercase, real
 * descenders and the full printable ASCII range, for a canvas with room.
 *
 * ## The cell, and what a row means
 *
 * A glyph is rows of `#` (ink) and `.` (transparent), written top to bottom.
 * A glyph may be NARROWER than the font's nominal cell and may have FEWER rows
 * than its height; missing columns and rows are transparent. That is what makes
 * the layout proportional: `I` advances one pixel and `M` advances five, which
 * is the difference between text that reads and text that looks like a ransom
 * note.
 *
 * In `5x7` the rows mean something fixed: 0-4 are the cap height, 1-4 the
 * x-height, and 5-6 the descender. A lowercase letter therefore starts with a
 * blank row, which is why it is written out rather than trimmed.
 *
 * The x-height is four rows rather than three, and that is the difference
 * between lowercase that reads and lowercase that does not. At three rows an `e`
 * has no room for a counter and renders as a blob with a bar through it — which
 * is exactly what it did, on screen, before this was four.
 */

import { TRANSPARENT, parseColor } from './color';
import { Pat } from './pattern';

/** The built-in fonts, named for their cell. */
export type FontName = '3x5' | '5x7';

export interface Font {
  /** Rows in the cell. Every glyph is laid out against this, not its own height. */
  height: number;
  /** Pixels between glyphs, and between lines, unless the call says otherwise. */
  gap: number;
  line: number;
  /** Glyph rows, joined by `/`. Missing columns and trailing rows are transparent. */
  glyphs: Record<string, string>;
  /** What an unmapped character draws: a solid block, which no glyph looks like. */
  fallback: string;
}

/**
 * Caps, digits and punctuation at 3x5. No lowercase: at three pixels wide there
 * is no room for an x-height that is shorter than the caps, so a lowercase
 * letter is drawn with its capital rather than with a guess. `5x7` is the font
 * that distinguishes them.
 */
const FONT_3X5: Font = {
  height: 5,
  gap: 1,
  line: 1,
  fallback: '###/###/###/###/###',
  glyphs: {
    ' ': '../../../../..',
    A: '.#./#.#/###/#.#/#.#',
    B: '##./#.#/##./#.#/##.',
    C: '.##/#../#../#../.##',
    D: '##./#.#/#.#/#.#/##.',
    E: '###/#../##./#../###',
    F: '###/#../##./#../#..',
    G: '.##/#../#.#/#.#/.##',
    H: '#.#/#.#/###/#.#/#.#',
    I: '#/#/#/#/#',
    J: '..#/..#/..#/#.#/.#.',
    K: '#.#/##./#../##./#.#',
    L: '#../#../#../#../###',
    M: '#...#/##.##/#.#.#/#...#/#...#',
    N: '#..#/##.#/#.##/#..#/#..#',
    O: '.#./#.#/#.#/#.#/.#.',
    P: '##./#.#/##./#../#..',
    Q: '.#./#.#/#.#/#.#/.##',
    R: '##./#.#/##./#.#/#.#',
    S: '.##/#../.#./..#/##.',
    T: '###/.#./.#./.#./.#.',
    U: '#.#/#.#/#.#/#.#/###',
    V: '#.#/#.#/#.#/#.#/.#.',
    W: '#...#/#...#/#.#.#/##.##/#...#',
    X: '#.#/#.#/.#./#.#/#.#',
    Y: '#.#/#.#/.#./.#./.#.',
    Z: '###/..#/.#./#../###',
    0: '###/#.#/#.#/#.#/###',
    1: '.#./##./.#./.#./###',
    2: '##./..#/.#./#../###',
    3: '##./..#/.#./..#/##.',
    4: '#.#/#.#/###/..#/..#',
    5: '###/#../##./..#/##.',
    6: '.##/#../###/#.#/###',
    7: '###/..#/.#./.#./.#.',
    8: '###/#.#/###/#.#/###',
    9: '###/#.#/###/..#/..#',
    '.': '././././#',
    ',': '../../../.#/#.',
    ':': './#/./#/.',
    ';': '../.#/../.#/#.',
    '!': '#/#/#/./#',
    '?': '##./..#/.#./.../.#.',
    "'": '#/#/././.',
    '"': '#.#/#.#/.../.../...',
    '-': '.../.../###/.../...',
    '+': '.../.#./###/.#./...',
    '=': '.../###/.../###/...',
    _: '.../.../.../.../###',
    '/': '..#/..#/.#./#../#..',
    '\\': '#../#../.#./..#/..#',
    '(': '.#/#./#./#./.#',
    ')': '#./.#/.#/.#/#.',
    '[': '##/#./#./#./##',
    ']': '##/.#/.#/.#/##',
    '{': '.#/.#/#./.#/.#',
    '}': '#./#./.#/#./#.',
    '<': '..#/.#./#../.#./..#',
    '>': '#../.#./..#/.#./#..',
    '*': '.../#.#/.#./#.#/...',
    '#': '#.#/###/#.#/###/#.#',
    '%': '#.#/..#/.#./#../#.#',
    '&': '.#./#.#/.#./#.#/.##',
    '@': '.#./#.#/###/#../.##',
    $: '.##/##./.#./.##/##.',
    '^': '.#./#.#/.../.../...',
    '~': '.../.##/##./.../...',
    '|': '#/#/#/#/#',
    '`': '#./.#/../../..',
  },
};

/**
 * The full printable range, with lowercase that is really lowercase.
 *
 * Rows 0-4 are the cap height, 1-4 the x-height, 5-6 the descender, so `p` and
 * `y` hang below `o` the way they should and a line of mixed-case text has a
 * baseline rather than a top edge.
 */
const FONT_5X7: Font = {
  height: 7,
  gap: 1,
  line: 1,
  fallback: '####/#..#/#..#/#..#/####',
  glyphs: {
    ' ': '.../.../.../.../...',
    A: '.###./#...#/#####/#...#/#...#',
    B: '####./#...#/####./#...#/####.',
    C: '.####/#..../#..../#..../.####',
    D: '####./#...#/#...#/#...#/####.',
    E: '#####/#..../###../#..../#####',
    F: '#####/#..../###../#..../#....',
    G: '.####/#..../#..##/#...#/.###.',
    H: '#...#/#...#/#####/#...#/#...#',
    I: '###/.#./.#./.#./###',
    J: '...#/...#/...#/#..#/.##.',
    K: '#...#/#..#./###../#..#./#...#',
    L: '#..../#..../#..../#..../#####',
    M: '#...#/##.##/#.#.#/#...#/#...#',
    N: '#...#/##..#/#.#.#/#..##/#...#',
    O: '.###./#...#/#...#/#...#/.###.',
    P: '####./#...#/####./#..../#....',
    Q: '.###./#...#/#...#/#..#./.##.#',
    R: '####./#...#/####./#..#./#...#',
    S: '.####/#..../.###./....#/####.',
    T: '#####/..#../..#../..#../..#..',
    U: '#...#/#...#/#...#/#...#/.###.',
    V: '#...#/#...#/#...#/.#.#./..#..',
    W: '#...#/#...#/#.#.#/##.##/#...#',
    X: '#...#/.#.#./..#../.#.#./#...#',
    Y: '#...#/.#.#./..#../..#../..#..',
    Z: '#####/...#./..#../.#.../#####',
    a: '..../###./#..#/#..#/.###',
    b: '#.../###./#..#/#..#/###.',
    c: '..../.###/#.../#.../.###',
    d: '...#/.###/#..#/#..#/.###',
    e: '..../.##./####/#.../.###',
    f: '.##/#../###/#../#..',
    g: '..../.###/#..#/#..#/.###/...#/###.',
    h: '#.../###./#..#/#..#/#..#',
    i: '#/./#/#/#',
    j: '.#/../.#/.#/.#/.#/#.',
    k: '#../#.#/##./#.#/#.#',
    l: '#./#./#./#./##',
    m: '...../#####/#.#.#/#.#.#/#.#.#',
    n: '..../###./#..#/#..#/#..#',
    o: '..../.##./#..#/#..#/.##.',
    p: '..../###./#..#/#..#/###./#.../#...',
    q: '..../.###/#..#/#..#/.###/...#/...#',
    r: '.../###/#../#../#..',
    s: '..../.###/##../..##/###.',
    t: '.#./###/.#./.#./.##',
    u: '..../#..#/#..#/#..#/.###',
    v: '..../#..#/#..#/#..#/.##.',
    w: '...../#...#/#.#.#/#.#.#/.#.#.',
    x: '..../#..#/.##./.##./#..#',
    y: '..../#..#/#..#/#..#/.###/...#/###.',
    z: '..../####/..#./.#../####',
    0: '.##./#.##/##.#/#..#/.##.',
    1: '.#./##./.#./.#./###',
    2: '.##./#..#/..#./.#../####',
    3: '###./...#/.##./...#/###.',
    4: '#..#/#..#/####/...#/...#',
    5: '####/#.../###./...#/###.',
    6: '.##./#.../###./#..#/.##.',
    7: '####/...#/..#./.#../.#..',
    8: '.##./#..#/.##./#..#/.##.',
    9: '.##./#..#/.###/...#/.##.',
    '.': '././././#',
    ',': '../../../../.#/#.',
    ':': './#/./#/.',
    ';': '../.#/../../.#/#.',
    '!': '#/#/#/./#',
    '?': '###./...#/.##./..../.#..',
    "'": '#/#/././.',
    '"': '#.#/#.#/.../.../...',
    '-': '.../.../###/.../...',
    '+': '.../.#./###/.#./...',
    '=': '.../###/.../###/...',
    _: '..../..../..../..../..../####',
    '/': '..#/..#/.#./#../#..',
    '\\': '#../#../.#./..#/..#',
    '(': '.#/#./#./#./.#',
    ')': '#./.#/.#/.#/#.',
    '[': '##/#./#./#./##',
    ']': '##/.#/.#/.#/##',
    '{': '.##/.#./##./.#./.##',
    '}': '##./.#./.##/.#./##.',
    '<': '..#/.#./#../.#./..#',
    '>': '#../.#./..#/.#./#..',
    '*': '.../#.#/.#./#.#/...',
    '#': '.#.#./#####/.#.#./#####/.#.#.',
    '%': '##..#/##.#./..#../.#.##/#..##',
    '&': '.##../#..#./.##../#..#./.##.#',
    '@': '.###./#...#/#.###/#..../.###.',
    $: '.####/#.#../.###./..#.#/####.',
    '^': '.#./#.#/.../.../...',
    '~': '...../.#.../#.#.#/...#./.....',
    '|': '#/#/#/#/#',
    '`': '#./.#/../../..',
  },
};

export const FONTS: Readonly<Record<FontName, Font>> = Object.freeze({
  '3x5': FONT_3X5,
  '5x7': FONT_5X7,
});

export const FONT_NAMES: readonly FontName[] = Object.freeze(Object.keys(FONTS) as FontName[]);

/** Resolve a font name, or throw with the list — the same contract as `ramp()`. */
export function resolveFont(name: string): Font {
  const found = (FONTS as Record<string, Font | undefined>)[name];
  if (!found) throw new Error(`Unknown font: ${name}. Try ${FONT_NAMES.join(', ')}.`);
  return found;
}

export type TextAlign = 'left' | 'center' | 'right';

export interface TextOptions {
  font?: FontName;
  /** Same as the positional colour, for a call that only wants to name things. */
  color?: string | number;
  /** Pixels between glyphs, and between lines. Both default to the font's own. */
  gap?: number;
  line?: number;
  /** How short lines sit against the longest one. Only visible on multiple lines. */
  align?: TextAlign;
}

/** A glyph, decoded once: its rows and the width it advances by. */
interface Glyph {
  rows: string[];
  width: number;
}

function decode(spec: string): Glyph {
  const rows = spec.split('/');
  let width = 0;
  for (const row of rows) if (row.length > width) width = row.length;
  return { rows, width };
}

/**
 * The glyph for one character.
 *
 * A font without lowercase answers with the capital rather than with the
 * fallback, because "this font has no separate lowercase" and "this character
 * is not in the font" are different facts and only the second one is worth
 * showing a block for.
 */
function glyphFor(font: Font, ch: string): Glyph {
  const direct = font.glyphs[ch];
  if (direct !== undefined) return decode(direct);

  const upper = ch.toUpperCase();
  if (upper !== ch) {
    const folded = font.glyphs[upper];
    if (folded !== undefined) return decode(folded);
  }

  return decode(font.fallback);
}

function ink(glyph: Glyph, x: number, y: number): boolean {
  if (y < 0 || y >= glyph.rows.length) return false;
  const row = glyph.rows[y];
  return x >= 0 && x < row.length && row[x] === '#';
}

/** Tabs are whitespace, not a missing character: four spaces, like an editor. */
function expandTabs(str: string): string {
  return str.replace(/\t/g, '    ');
}

function lineWidth(glyphs: Glyph[], gap: number): number {
  if (glyphs.length === 0) return 0;
  let width = 0;
  for (const glyph of glyphs) width += glyph.width + gap;
  return width - gap;
}

/**
 * Text as a pattern, in one of the built-in fonts.
 *
 * ```js
 * text('HELLO')                        // 3x5, white
 * text('HELLO', '#e43b44')             // the colour, positionally, like rect()
 * text('Hello', { font: '5x7' })       // or as options, with or without a colour
 * ```
 *
 * Newlines make lines. The box is the text's own, so `.center()` puts it in the
 * middle of the canvas and `.outline()` rings the letters rather than the box.
 */
export function text(
  str: string,
  colorOrOptions: string | number | TextOptions = '#ffffff',
  maybeOptions?: TextOptions,
): Pat {
  const positional = typeof colorOrOptions === 'string' || typeof colorOrOptions === 'number';
  const options: TextOptions = (positional ? maybeOptions : colorOrOptions) ?? {};
  const color = parseColor(positional ? (colorOrOptions as string | number) : (options.color ?? '#ffffff'));

  const font = resolveFont(options.font ?? '3x5');
  const gap = Math.max(0, Math.round(options.gap ?? font.gap));
  const leading = Math.max(0, Math.round(options.line ?? font.line));
  const align: TextAlign = options.align ?? 'left';

  const lines = expandTabs(String(str)).split('\n').map((line) => [...line].map((ch) => glyphFor(font, ch)));

  const width = Math.max(0, ...lines.map((glyphs) => lineWidth(glyphs, gap)));
  const height = lines.length * font.height + (lines.length - 1) * leading;

  if (width === 0 || height === 0) return new Pat(() => TRANSPARENT, 0, 0);

  // Rasterised once, at construction. A sketch samples every pixel of every
  // frame, and walking the glyph list per sample would make a word on screen
  // cost more than the sprite it sits on.
  const bits = new Uint8Array(width * height);
  lines.forEach((glyphs, index) => {
    const top = index * (font.height + leading);
    const slack = width - lineWidth(glyphs, gap);
    let left = align === 'right' ? slack : align === 'center' ? Math.floor(slack / 2) : 0;

    for (const glyph of glyphs) {
      for (let y = 0; y < font.height; y += 1) {
        for (let x = 0; x < glyph.width; x += 1) {
          if (ink(glyph, x, y)) bits[(top + y) * width + (left + x)] = 1;
        }
      }
      left += glyph.width + gap;
    }
  });

  return new Pat(
    (x, y) => (x >= 0 && y >= 0 && x < width && y < height && bits[y * width + x] === 1 ? color : TRANSPARENT),
    width,
    height,
  );
}
