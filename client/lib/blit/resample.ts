/**
 * Fitting a PNG onto a grid small enough to be source.
 *
 * `importImage` emits one character per pixel, so the grid is capped at
 * `IMPORT_MAX_SIDE` and always will be: a 1024x1024 literal is a megabyte of
 * text and no editor makes that usable. But 1024x1024 is what pixel art is
 * actually SHARED as — a 32x32 sprite saved at 16x for a store page, a tileset
 * exported at 8x so it reads on a phone. Refusing those is refusing the common
 * case for a reason that is really about the grid, not about the file.
 *
 * So the file limit and the grid limit are two different numbers, and this is
 * what sits between them.
 *
 * **Nearest-neighbour, and nothing else.** Every other resampling filter — box,
 * bilinear, Lanczos — computes a weighted average, and an average of two colours
 * is a third colour that was not in the image. On a photograph that is the point;
 * here it would invent hundreds of palette entries, blow the colour cap in one
 * step, and break the promise the importer is built on. Nearest keeps the palette
 * a subset of the file's, which is why the round trip below can be exact rather
 * than merely close.
 *
 * `naturalSide` is what makes that pay off. An image that is a whole-number
 * upscale of a smaller one carries its original inside it, and sampling at the
 * right size recovers that original byte for byte. So the 512x512 that is really
 * a 32x32 does not come back approximated: it comes back as the sprite somebody
 * drew.
 */

import { colorAt, TRANSPARENT, type Color } from './color';
import { IMPORT_MAX_COLORS, IMPORT_MAX_SIDE } from './importImage';

/**
 * The sizes offered without being asked for, as the LONGEST side of the result.
 *
 * Powers of two because that is what sprite work is in, and because a source
 * that is itself a power-of-two upscale then lands on one of them exactly.
 */
export const DOWNSCALE_PRESETS: readonly number[] = Object.freeze([16, 32, 64, 128]);

export interface Fit {
  width: number;
  height: number;
}

/**
 * The grid an image becomes when its longest side is `size`.
 *
 * The governing side is assigned `size` rather than computed from a ratio, so
 * asking for 128 gives 128 and not the 127 that floating-point rounding can
 * produce. A size that is not smaller than the image is the image: there is no
 * reason to offer an upscale, and silently clamping is kinder than an error for
 * a number that means "at most this big".
 */
export function fitted(w: number, h: number, size: number): Fit {
  const longest = Math.max(w, h);
  if (size >= longest) return { width: w, height: h };
  const scale = size / longest;
  return {
    width: w >= h ? size : Math.max(1, Math.round(w * scale)),
    height: h >= w ? size : Math.max(1, Math.round(h * scale)),
  };
}

/**
 * Nearest-neighbour resample, sampling the CENTRE of each destination pixel.
 *
 * `(x + 0.5) * w / tw` rather than `x * w / tw`, which matters twice over: it
 * keeps the image where it was instead of shifting it half a destination pixel
 * up and left, and on a whole-number divisor it lands inside each source block
 * rather than on its corner, so a block that disagrees with its neighbour cannot
 * be read from the wrong side of the seam.
 */
export function resampleNearest(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  tw: number,
  th: number,
): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(tw * th * 4) as Uint8ClampedArray<ArrayBuffer>;
  for (let y = 0; y < th; y += 1) {
    const sy = Math.min(h - 1, Math.floor(((y + 0.5) * h) / th));
    for (let x = 0; x < tw; x += 1) {
      const sx = Math.min(w - 1, Math.floor(((x + 0.5) * w) / tw));
      const si = (sy * w + sx) * 4;
      const di = (y * tw + x) * 4;
      out[di] = data[si];
      out[di + 1] = data[si + 1];
      out[di + 2] = data[si + 2];
      out[di + 3] = data[si + 3];
    }
  }
  return out;
}

/**
 * How many distinct visible colours an RGBA buffer holds.
 *
 * The same count `importRgba` would arrive at, which is the point: it is what
 * decides whether a size can be imported at all, and it is reported per option
 * so the choice is made with the number rather than against it.
 */
export function paletteSize(data: Uint8ClampedArray, w: number, h: number): number {
  const seen = new Set<Color>();
  for (let i = 0; i < w * h * 4; i += 4) {
    const color = colorAt(data, i);
    if (color !== TRANSPARENT) seen.add(color);
  }
  return seen.size;
}

function gcd(a: number, b: number): number {
  let x = a;
  let y = b;
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
}

/** Is every `k` by `k` block of this image one flat colour? */
function blockUniform(data: Uint8ClampedArray, w: number, h: number, k: number): boolean {
  for (let by = 0; by < h; by += k) {
    for (let bx = 0; bx < w; bx += k) {
      const first = colorAt(data, (by * w + bx) * 4);
      for (let y = by; y < by + k; y += 1) {
        for (let x = bx; x < bx + k; x += 1) {
          if (colorAt(data, (y * w + x) * 4) !== first) return false;
        }
      }
    }
  }
  return true;
}

/**
 * The longest side of the smallest grid this image reduces to with NOTHING lost,
 * or null when it does not reduce at all.
 *
 * True exactly when the image is a whole-number upscale of that grid. Testing
 * the largest common divisor first finds the most reduced form, and it is the
 * cheap direction too: a real photograph fails `k = 1024` after a handful of
 * pixels, and each smaller `k` fails as fast.
 */
export function naturalSide(data: Uint8ClampedArray, w: number, h: number): number | null {
  const common = gcd(w, h);
  for (let k = common; k > 1; k -= 1) {
    if (common % k !== 0) continue;
    if (blockUniform(data, w, h, k)) return Math.max(w, h) / k;
  }
  return null;
}

export interface DownscaleOption {
  /** The longest side, and what to ask the import for. */
  size: number;
  width: number;
  height: number;
  /** Distinct visible colours the grid would have at this size. */
  colors: number;
  /** Nothing is lost here: the image is a whole-number upscale of this grid. */
  exact: boolean;
  /** Would the import go through, or is this still past the colour cap? */
  fits: boolean;
}

/**
 * Every size worth offering for this image, with the numbers that decide it.
 *
 * The colour count is measured on the resampled grid, not guessed from the
 * original: a downscale genuinely drops colours, and by how much is the single
 * fact that makes the difference between "this is a sprite" and "this is a
 * photograph and Blit is the wrong tool". Cheap to measure, because every
 * candidate is at most `IMPORT_MAX_SIDE` square.
 */
export function downscaleOptions(data: Uint8ClampedArray, w: number, h: number): DownscaleOption[] {
  const longest = Math.max(w, h);
  const sizes = new Set<number>(DOWNSCALE_PRESETS.filter((size) => size < longest));
  const natural = naturalSide(data, w, h);
  if (natural !== null && natural <= IMPORT_MAX_SIDE) sizes.add(natural);

  return [...sizes]
    .sort((a, b) => a - b)
    .map((size) => {
      const { width, height } = fitted(w, h, size);
      const colors = paletteSize(resampleNearest(data, w, h, width, height), width, height);
      return { size, width, height, colors, exact: size === natural, fits: colors <= IMPORT_MAX_COLORS };
    });
}
