/**
 * Turning a PNG into a sprite literal.
 *
 * The README draws a line — "Blit is not a replacement for a pixel editor" — and
 * this feature sits right on it. What keeps it on the right side is that the
 * import produces **code**: a `sprite(...)` grid and the `.pal()` that binds its
 * characters, dropped into the editor as text to be edited, parameterised and
 * animated. An importer that produced an opaque bitmap layer would be the other
 * thing.
 *
 * Nothing here is quantised or approximated. Every distinct RGBA value in the
 * image gets its own character, which is what lets the emitted source round-trip:
 * evaluate it and render it at the image's size and you get the image back, byte
 * for byte. Reducing the palette would break that, so an image with more colours
 * than a grid can usefully carry is REFUSED with the count rather than silently
 * flattened. Blit is the wrong tool for that step; a pixel editor is the right
 * one, and saying so is more use than emitting four hundred characters of
 * unreadable source.
 *
 * Resizing is the one thing that is not refused, and it is not done here either.
 * The grid limit and the file limit are two separate numbers (see below), and
 * `resample.ts` is what sits between them: it picks pixels rather than blending
 * them, so what arrives at this function is still a subset of the file's own
 * colours and everything above still holds of it.
 *
 * Fully transparent pixels are the one exception to "byte for byte", and they
 * are not really an exception: alpha 0 means the RGB channels carry nothing, and
 * a decoder is free to put anything in them.
 */

import { alpha, blue, colorAt, green, red, toCss, TRANSPARENT, type Color } from './color';
import { LETTERS } from './palettes';

/**
 * The largest PNG Blit will read at all. Above this the file is refused outright.
 *
 * Deliberately eight times the grid limit, because a sprite is very often SHARED
 * at a multiple of the size it was drawn at: a 32x32 saved at 16x for a store
 * page, a tileset exported at 8x so it reads on a phone. The grid cannot be that
 * big, but the file being that big says nothing about the art, so a size is
 * chosen for it instead (`resample.ts`) rather than the import being refused for
 * a reason that was never about the picture.
 */
export const IMPORT_MAX_SOURCE = 1024;

/** Refused above this on either side: 128x128 is already 16k characters of source. */
export const IMPORT_MAX_SIDE = 128;
/** Warned above this: still workable, but the literal stops fitting on a screen. */
export const IMPORT_WARN_SIDE = 64;
/** Warned above this: the `.pal()` is longer than the sprite it serves. */
export const IMPORT_WARN_COLORS = 24;

/** How close, in RGB space, a colour has to be to borrow a letter's mnemonic. */
const MNEMONIC_DISTANCE = 100;

/** The transparent character. NOT a space — see `emitRows`. */
const TRANSPARENT_CHAR = '.';

/**
 * Characters for colours with no mnemonic.
 *
 * Deliberately none of `LETTERS`' own keys: an unclaimed `g` bound to purple
 * would read as green in the grid and be a lie in the art, which is the one thing
 * a mnemonic system must not do. Lowercase first because a grid of lowercase
 * reads as a picture; digits never, because they index the active ramp and a
 * `.pal()` entry overriding one is a puzzle rather than a sprite.
 */
const CHAR_POOL = [
  ...'aefhjquxz',
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
];

/**
 * Refused above this many distinct colours: exactly the size of the pool.
 *
 * Derived, not chosen, and the derivation is the correction to a first guess of
 * 48. A mnemonic is only awarded when a colour happens to be near one, so the
 * mnemonics are HEADROOM and the pool alone is capacity — 48 ran the pool dry on
 * an image of 48 near-black greys, which a test caught. Growing the pool raises
 * the cap with it, and the exhaustion guard below becomes unreachable rather than
 * merely unlikely.
 *
 * 35 is still generous for the work: pico8 and sweetie16 are 16 colours each.
 */
export const IMPORT_MAX_COLORS = CHAR_POOL.length;

export interface ImportedSprite {
  /** Grid rows, top to bottom, with no indentation. */
  rows: string[];
  width: number;
  height: number;
  /** `[character, css]` for every character `.pal()` has to bind, in first-seen order. */
  bindings: [string, string][];
  /** How many distinct visible colours the image had. */
  colors: number;
  warnings: string[];
}

/**
 * Why a FILE is too big to read, in words meant for a person.
 *
 * The one refusal with no way forward inside Blit, so it says what the file would
 * have to be rather than offering a choice there is nothing to choose from. Read
 * off the PNG header before anything is decoded: refusing a 4000px photo after
 * paying 64MB for its pixels is a worse version of the same answer.
 */
export function tooBigSourceReason(w: number, h: number): string {
  return (
    `That image is ${w}x${h}. Blit reads PNGs up to ${IMPORT_MAX_SOURCE}x${IMPORT_MAX_SOURCE}, and scales ` +
    `anything over ${IMPORT_MAX_SIDE} down to a size you pick. Past ${IMPORT_MAX_SOURCE} it wants a smaller file.`
  );
}

/**
 * Why a GRID is too big, in words meant for a person.
 *
 * A different answer from the one above, because there is something to do about
 * it: the size is chosen, so it can be chosen smaller. Reachable from the API
 * (a caller may ask for any size) and kept as a guard here, where the grid is
 * actually emitted.
 */
export function tooBigGridReason(w: number, h: number): string {
  return (
    `${w}x${h} is more grid than the editor can hold usefully: a sprite literal stops at ` +
    `${IMPORT_MAX_SIDE}x${IMPORT_MAX_SIDE}, which is already ${IMPORT_MAX_SIDE * IMPORT_MAX_SIDE} characters. ` +
    `Import it at a smaller size.`
  );
}

export type ImportOutcome = { ok: true; sprite: ImportedSprite } | { ok: false; reason: string };

/** Squared RGB distance. Squared because only the comparison matters. */
function rgbDistance2(a: Color, b: Color): number {
  const dr = red(a) - red(b);
  const dg = green(a) - green(b);
  const db = blue(a) - blue(b);
  return dr * dr + dg * dg + db * db;
}

/** The mnemonic letters, without the two transparent keys, as `[char, color]`. */
const MNEMONICS: [string, Color][] = Object.entries(LETTERS).filter(
  ([ch]) => ch !== TRANSPARENT_CHAR && ch !== ' ',
);

/**
 * The letter a colour should borrow, or null.
 *
 * Only an OPAQUE colour may borrow one: a half-transparent blue is not `b`,
 * however close the hue is, and letting it take the letter would make the grid
 * claim something the picture does not do.
 */
function mnemonicFor(color: Color, taken: Set<string>): string | null {
  if (alpha(color) !== 255) return null;
  let best: string | null = null;
  let bestAt = MNEMONIC_DISTANCE * MNEMONIC_DISTANCE;
  for (const [ch, value] of MNEMONICS) {
    if (taken.has(ch)) continue;
    const d = rgbDistance2(color, value);
    if (d < bestAt) {
      best = ch;
      bestAt = d;
    }
  }
  return best;
}

/**
 * Read an RGBA buffer into a sprite grid and the palette that goes with it.
 *
 * Refuses rather than approximates. Every refusal names the number that caused
 * it, because "too many colours" without the count leaves the next move to
 * guesswork.
 */
export function importRgba(data: Uint8ClampedArray, w: number, h: number): ImportOutcome {
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1) {
    return { ok: false, reason: 'That image has no pixels in it.' };
  }
  if (w > IMPORT_MAX_SIDE || h > IMPORT_MAX_SIDE) return { ok: false, reason: tooBigGridReason(w, h) };
  if (data.length !== w * h * 4) {
    return { ok: false, reason: `That image decoded to ${data.length} bytes, not the ${w * h * 4} a ${w}x${h} RGBA image has.` };
  }

  // First pass: which colours are in play, in the order the image introduces
  // them, so the palette reads top-left to bottom-right like the picture does.
  const order: Color[] = [];
  const seen = new Map<Color, true>();
  for (let i = 0; i < data.length; i += 4) {
    const color = colorAt(data, i);
    if (color === TRANSPARENT) continue;
    if (seen.has(color)) continue;
    seen.set(color, true);
    order.push(color);
  }

  if (order.length > IMPORT_MAX_COLORS) {
    return {
      ok: false,
      reason:
        `That image has ${order.length} distinct colours. A sprite grid names one character per colour and ` +
        `stops at ${IMPORT_MAX_COLORS}. A smaller size keeps fewer pixels and so fewer colours; past that, its ` +
        `palette has to be reduced in a pixel editor. Nothing here approximates a colour, so which ones to ` +
        `lose is not Blit's decision to make.`,
    };
  }

  // Second pass: hand out characters. Mnemonics first, so `w` lands on white
  // rather than on whichever colour happens to appear first.
  const charOf = new Map<Color, string>();
  const taken = new Set<string>([TRANSPARENT_CHAR, ' ']);
  const bindings: [string, string][] = [];
  let poolAt = 0;

  for (const color of order) {
    let ch = mnemonicFor(color, taken);
    if (ch === null) {
      while (poolAt < CHAR_POOL.length && taken.has(CHAR_POOL[poolAt])) poolAt += 1;
      if (poolAt >= CHAR_POOL.length) {
        // Unreachable: IMPORT_MAX_COLORS *is* the pool's size and the refusal
        // above has already fired. Kept as a refusal rather than a wrong grid in
        // case the two ever come apart.
        return { ok: false, reason: `That image needs more grid characters than Blit has (${order.length}).` };
      }
      ch = CHAR_POOL[poolAt];
    }
    taken.add(ch);
    charOf.set(color, ch);
    // A mnemonic whose default is already exactly right needs no binding; every
    // other character does, and that is what makes the round trip exact.
    if (LETTERS[ch] !== color) bindings.push([ch, toCss(color)]);
  }

  const rows: string[] = [];
  for (let y = 0; y < h; y += 1) {
    let line = '';
    for (let x = 0; x < w; x += 1) {
      const color = colorAt(data, (y * w + x) * 4);
      line += color === TRANSPARENT ? TRANSPARENT_CHAR : (charOf.get(color) ?? TRANSPARENT_CHAR);
    }
    rows.push(line);
  }

  const warnings: string[] = [];
  if (w > IMPORT_WARN_SIDE || h > IMPORT_WARN_SIDE) {
    warnings.push(`${w}x${h} is a large grid: ${w * h} characters of source. It will work; it will not be pleasant to edit.`);
  }
  if (order.length > IMPORT_WARN_COLORS) {
    warnings.push(`${order.length} colours means a .pal() longer than the sprite. Consider reducing the palette first.`);
  }

  return { ok: true, sprite: { rows, width: w, height: h, bindings, colors: order.length, warnings } };
}

/**
 * The `.pal({ ... })` call, or an empty string when nothing needs binding.
 *
 * One line while it fits, one entry per line when it does not. A palette that
 * has wrapped onto forty lines is the first thing the person will edit, so it
 * should already be laid out the way they will want to read it.
 */
function palCall(bindings: [string, string][], indent: string): string {
  if (bindings.length === 0) return '';
  const entries = bindings.map(([ch, css]) => `${ch}: '${css}'`);
  const oneLine = `.pal({ ${entries.join(', ')} })`;
  if (oneLine.length <= 68) return oneLine;
  return `.pal({\n${entries.map((e) => `${indent}  ${e},`).join('\n')}\n${indent}})`;
}

/**
 * The grid, as the body of a template literal.
 *
 * Every row is emitted at full width with `.` for transparency, never a space.
 * That is load-bearing: `parseSpriteGrid` trims trailing whitespace off each row
 * and drops blank lines at the top and bottom, so a sprite whose right column or
 * bottom row is empty would come back narrower or shorter than the image. `.` is
 * not whitespace, so the footprint survives.
 */
function emitRows(rows: string[], indent: string): string {
  return `\n${rows.map((r) => `${indent}${r}`).join('\n')}\n`;
}

/**
 * The imported sprite as one expression, ready to be inserted at the cursor.
 *
 * `indent` is the whitespace the grid lines carry inside the literal. It is also
 * what `parseSpriteGrid` strips back off, so any consistent value works.
 */
export function spriteExpression(sprite: ImportedSprite, indent = '  '): string {
  return `sprite(\`${emitRows(sprite.rows, indent)}\`)${palCall(sprite.bindings, '')}`;
}

/**
 * The imported sprite as a whole sketch, for a buffer with nothing in it yet.
 *
 * `size()` matches the image exactly and there is no `.center()`, so what appears
 * on the canvas is the file. Both are the caller's to change, which is the point
 * of emitting code at all.
 */
export function sketchSource(sprite: ImportedSprite): string {
  return `size(${sprite.width}, ${sprite.height});\n\nout(sprite(\`${emitRows(sprite.rows, '  ')}\`)${palCall(sprite.bindings, '')});\n`;
}
