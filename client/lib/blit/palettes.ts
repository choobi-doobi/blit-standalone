/**
 * Blit palettes: the character-to-color map, and the named ramps.
 *
 * A sprite's characters are NOT resolved when the sprite is built. They are
 * resolved at sample time against the palette carried in the render context,
 * which is what makes `.pal()` work as an ordinary combinator anywhere in a
 * chain, and what makes `.palShift()` (palette cycling) a one-liner instead of
 * a rebuild.
 */

import { parseColor, TRANSPARENT, type Color } from './color';

/** Character to color. Values are resolved colors; `undefined` means unmapped. */
export type Palette = Record<string, Color>;

/**
 * The letter mnemonics every sketch starts with.
 *
 * One letter per hue so a grid stays readable as art: `k` for black through `w`
 * for white, then the hues. `.` and a space are transparent, which is why
 * negative space in a sprite literal reads as negative space on screen.
 */
export const LETTERS: Palette = {
  '.': TRANSPARENT,
  ' ': TRANSPARENT,
  k: parseColor('#000000'), // black
  d: parseColor('#3a3a3a'), // dark grey
  s: parseColor('#767676'), // slate
  l: parseColor('#b8b8b8'), // light grey
  w: parseColor('#ffffff'), // white
  r: parseColor('#e43b44'), // red
  o: parseColor('#f77622'), // orange
  y: parseColor('#feae34'), // yellow
  g: parseColor('#63c74d'), // green
  t: parseColor('#0099db'), // teal
  c: parseColor('#2ce8f5'), // cyan
  b: parseColor('#124e89'), // blue
  i: parseColor('#3b5dc9'), // indigo
  v: parseColor('#8b5cf6'), // violet
  m: parseColor('#e926a3'), // magenta
  p: parseColor('#ffaeb6'), // pink
  n: parseColor('#8f563b'), // brown
};

const ramp = (...hexes: string[]): Color[] => hexes.map((h) => parseColor(h));

/**
 * Named ramps. Digits `0`-`9` in a sprite index into the ACTIVE ramp, so
 * swapping ramps recolors every digit-addressed sprite at once, and
 * `.palShift(n)` rotates them for free.
 */
export const RAMPS: Record<string, Color[]> = {
  // Default: a neutral 10-step value ramp. Dark to light, so `0` reads as
  // shadow and `9` as highlight without having to look anything up.
  default: ramp(
    '#0d0b1f', '#241e3a', '#3e3453', '#5c4f6b', '#7d6e85',
    '#a08f9e', '#c0b2ba', '#dbd0d6', '#efe8ec', '#ffffff',
  ),
  pico8: ramp(
    '#000000', '#1d2b53', '#7e2553', '#008751', '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8',
    '#ff004d', '#ffa300', '#ffec27', '#00e436', '#29adff', '#83769c', '#ff77a8', '#ffccaa',
  ),
  sweetie: ramp(
    '#1a1c2c', '#5d275d', '#b13e53', '#ef7d57', '#ffcd75', '#a7f070', '#38b764', '#257179',
    '#29366f', '#3b5dc9', '#41a6f6', '#73eff7', '#f4f4f4', '#94b0c2', '#566c86', '#333c57',
  ),
  gameboy: ramp('#0f380f', '#306230', '#8bac0f', '#9bbc0f'),
  cga: ramp(
    '#000000', '#0000aa', '#00aa00', '#00aaaa', '#aa0000', '#aa00aa', '#aa5500', '#aaaaaa',
    '#555555', '#5555ff', '#55ff55', '#55ffff', '#ff5555', '#ff55ff', '#ffff55', '#ffffff',
  ),
  ember: ramp(
    '#1a0f1f', '#42172b', '#7a2032', '#b03432', '#d75a2b', '#ef8c2b', '#f9bc3f', '#fce97a',
  ),
};

/**
 * Resolve one sprite character.
 *
 * Order matters: an explicit `.pal()` entry always wins, so a sketch can
 * rebind a digit or even `.` without fighting the defaults. Digits fall through
 * to the active ramp, and an unknown character is transparent (and reported as
 * a warning by the evaluator, so a typo is visible in the inspector rather
 * than silently invisible on the canvas).
 */
export function resolveChar(ch: string, pal: Palette, activeRamp: Color[]): Color | undefined {
  const explicit = pal[ch];
  if (explicit !== undefined) return explicit;

  if (ch >= '0' && ch <= '9') {
    const index = ch.charCodeAt(0) - 48;
    if (index < activeRamp.length) return activeRamp[index];
  }

  return undefined;
}

/** Rotate a ramp by `n` steps. The basis of palette cycling. */
export function shiftRamp(source: Color[], n: number): Color[] {
  const len = source.length;
  if (len === 0) return source;
  const by = ((Math.trunc(n) % len) + len) % len;
  if (by === 0) return source;
  return [...source.slice(by), ...source.slice(0, by)];
}
