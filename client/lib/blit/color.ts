/**
 * Blit colors.
 *
 * A color is ONE unsigned 32-bit integer, `0xRRGGBBAA`. That choice carries
 * the whole engine:
 *
 *   - Sampling a pattern returns a number, never an object, so the render loop
 *     allocates nothing per pixel.
 *   - **Alpha 0 means transparent, and transparent is just `0`.** There is no
 *     separate `null` case to test in every combinator, so `stack`, `mask` and
 *     friends stay two lines each.
 *
 * Beware the sign bit: `255 << 24` is negative in JavaScript, so every pack
 * ends in `>>> 0`.
 */

/** A pixel: `0xRRGGBBAA`, unsigned. `0` is fully transparent. */
export type Color = number;

/** Fully transparent. Also what an out-of-bounds sample returns. */
export const TRANSPARENT: Color = 0;

/** Pack channels (each clamped to 0-255) into a color. */
export function rgba(r: number, g: number, b: number, a = 255): Color {
  return (((clamp255(r) << 24) | (clamp255(g) << 16) | (clamp255(b) << 8) | clamp255(a)) >>> 0);
}

export function red(c: Color): number {
  return (c >>> 24) & 0xff;
}

export function green(c: Color): number {
  return (c >>> 16) & 0xff;
}

export function blue(c: Color): number {
  return (c >>> 8) & 0xff;
}

export function alpha(c: Color): number {
  return c & 0xff;
}

/**
 * The color at byte offset `i` of an RGBA buffer.
 *
 * Alpha 0 answers `TRANSPARENT` rather than the bytes as written. A decoder is
 * free to put anything in the RGB channels of a fully transparent pixel, so two
 * pixels that draw nothing must not read as two different colors — which they
 * would, and then a palette census would count them and a flat blank block
 * would look like detail.
 */
export function colorAt(data: Uint8ClampedArray | Uint8Array, i: number): Color {
  if (data[i + 3] === 0) return TRANSPARENT;
  return (((data[i] << 24) | (data[i + 1] << 16) | (data[i + 2] << 8) | data[i + 3]) >>> 0) as Color;
}

/** True when the pixel contributes anything at all. */
export function isVisible(c: Color): boolean {
  return (c & 0xff) !== 0;
}

function clamp255(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

/**
 * Perceptual-ish luminance, 0-255, ignoring alpha.
 *
 * Used by `dither` and by the inspector's contrast pick. Rec. 601 weights,
 * which are the ones pixel artists' tools have always used.
 */
export function luma(c: Color): number {
  return (red(c) * 299 + green(c) * 587 + blue(c) * 114) / 1000;
}

/**
 * Composite `top` over `bottom` (Porter-Duff source-over).
 *
 * Pixel art is mostly binary alpha, and the fast path takes care of that: a
 * fully opaque top simply wins. The general path exists so a translucent
 * shadow (`shadow(1, 1, '#0006')`) looks like a shadow instead of a black bar.
 */
export function over(top: Color, bottom: Color): Color {
  const at = alpha(top);
  if (at === 0) return bottom;
  if (at === 255) return top;
  const ab = alpha(bottom);
  if (ab === 0) return top;

  const ta = at / 255;
  const ba = ab / 255;
  const oa = ta + ba * (1 - ta);
  if (oa <= 0) return TRANSPARENT;

  const mix = (t: number, b: number): number => (t * ta + b * ba * (1 - ta)) / oa;
  return rgba(
    mix(red(top), red(bottom)),
    mix(green(top), green(bottom)),
    mix(blue(top), blue(bottom)),
    oa * 255,
  );
}

const NAMED: Record<string, Color> = {
  transparent: TRANSPARENT,
  none: TRANSPARENT,
  black: rgba(0, 0, 0),
  white: rgba(255, 255, 255),
  red: rgba(255, 0, 0),
  green: rgba(0, 128, 0),
  blue: rgba(0, 0, 255),
  cyan: rgba(0, 255, 255),
  magenta: rgba(255, 0, 255),
  yellow: rgba(255, 255, 0),
  orange: rgba(255, 165, 0),
  purple: rgba(128, 0, 128),
  brown: rgba(139, 69, 19),
  pink: rgba(255, 192, 203),
  grey: rgba(128, 128, 128),
  gray: rgba(128, 128, 128),
};

/**
 * Parse a CSS-ish color string: `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, or one
 * of a short list of names. Anything else throws, because a silent
 * transparent-on-typo is the kind of bug that wastes an afternoon.
 */
export function parseColor(input: string | number): Color {
  if (typeof input === 'number') return input >>> 0;

  const raw = input.trim().toLowerCase();
  const named = NAMED[raw];
  if (named !== undefined) return named;

  if (raw.startsWith('#')) {
    const hex = raw.slice(1);
    if (/^[0-9a-f]{3,4}$/.test(hex)) {
      const [r, g, b, a] = [...hex].map((ch) => parseInt(ch + ch, 16));
      return rgba(r, g, b, a ?? 255);
    }
    if (/^[0-9a-f]{6}$/.test(hex) || /^[0-9a-f]{8}$/.test(hex)) {
      const pair = (i: number): number => parseInt(hex.slice(i * 2, i * 2 + 2), 16);
      return rgba(pair(0), pair(1), pair(2), hex.length === 8 ? pair(3) : 255);
    }
  }

  throw new Error(`Not a color: ${input}`);
}

/** Render a color as `#rrggbb`, or `#rrggbbaa` when it is not fully opaque. */
export function toCss(c: Color): string {
  const hex = (v: number): string => v.toString(16).padStart(2, '0');
  const base = `#${hex(red(c))}${hex(green(c))}${hex(blue(c))}`;
  return alpha(c) === 255 ? base : `${base}${hex(alpha(c))}`;
}

/** A neutral grey from one 0-255 value. The quick way to make a field visible. */
export function grey(v: number, a = 255): Color {
  return rgba(v, v, v, a);
}

/**
 * HSL to a color. `h` is degrees (wraps), `s` and `l` are 0-1.
 *
 * Here so a generative `fn((x, y, t) => hsl(x * 8 + t, 0.7, 0.5))` needs no
 * imports and no color theory.
 */
export function hsl(h: number, s: number, l: number, a = 1): Color {
  const hue = (((h % 360) + 360) % 360) / 360;
  const sat = Math.min(1, Math.max(0, s));
  const lit = Math.min(1, Math.max(0, l));

  if (sat === 0) return grey(lit * 255, a * 255);

  const q = lit < 0.5 ? lit * (1 + sat) : lit + sat - lit * sat;
  const p = 2 * lit - q;
  const channel = (t: number): number => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };

  return rgba(channel(hue + 1 / 3) * 255, channel(hue) * 255, channel(hue - 1 / 3) * 255, a * 255);
}
