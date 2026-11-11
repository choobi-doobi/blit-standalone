/**
 * Frames to one PNG an agent can look at.
 *
 * One image, so a caller gets one picture back: several frames are
 * laid out as a contact sheet, left to right and then down, in frame order,
 * separated by a gutter. Upscaled nearest-neighbour, since a 32x32 sprite at
 * natural size is too small for a vision model to read a pixel of.
 *
 * Transparent pixels are composited over a checkerboard by default. A model
 * shown raw alpha sees whatever its client composites it onto, usually white or
 * black, and cannot tell a transparent pixel from one painted that colour.
 */

import { deflateSync } from 'node:zlib';

import { chunk, filterScanlines } from '../../client/lib/png.js';
import { parseColor } from '../../client/lib/blit/color.js';

export const MAX_SCALE = 16;
/** The auto scale aims for a sheet whose longest side is at most this. */
export const TARGET_SIDE = 1024;
/** An explicit scale may go this far, and no further. */
export const MAX_SIDE = 2048;
export const MAX_OUTPUT_PIXELS = 4_194_304;

const CHECKER_A: [number, number, number] = [0x2b, 0x2b, 0x33];
const CHECKER_B: [number, number, number] = [0x3a, 0x3a, 0x44];
const CHECKER_PX = 8;
const GUTTER_RGB: [number, number, number] = [0x8a, 0x8a, 0x99];

export type Background = { kind: 'checker' } | { kind: 'transparent' } | { kind: 'solid'; rgb: [number, number, number] };

export function parseBackground(value: unknown): Background | string {
  if (value === undefined || value === 'checker') return { kind: 'checker' };
  if (value === 'transparent') return { kind: 'transparent' };
  if (typeof value === 'string') {
    try {
      const c = parseColor(value);
      return { kind: 'solid', rgb: [(c >>> 24) & 0xff, (c >>> 16) & 0xff, (c >>> 8) & 0xff] };
    } catch {
      // fall through
    }
  }
  return "background must be 'checker', 'transparent' or a colour like '#1a1c2c'";
}

export interface SheetLayout {
  cols: number;
  rows: number;
  scale: number;
  gutter: number;
  width: number;
  height: number;
}

export function layoutSheet(w: number, h: number, count: number, scale?: number): SheetLayout | string {
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const size = (s: number): { width: number; height: number; gutter: number } => {
    const gutter = count > 1 ? Math.max(2, s) : 0;
    return { width: cols * w * s + (cols - 1) * gutter, height: rows * h * s + (rows - 1) * gutter, gutter };
  };

  if (scale !== undefined) {
    const { width, height, gutter } = size(scale);
    if (Math.max(width, height) > MAX_SIDE || width * height > MAX_OUTPUT_PIXELS) {
      return `At scale ${scale} the image would be ${width}x${height}, over the ${MAX_SIDE}px limit. Use a smaller scale, fewer frames, or omit scale to have one picked.`;
    }
    return { cols, rows, scale, gutter, width, height };
  }

  let best = 1;
  for (let s = 2; s <= MAX_SCALE; s += 1) {
    const { width, height } = size(s);
    if (Math.max(width, height) > TARGET_SIDE) break;
    best = s;
  }
  const { width, height, gutter } = size(best);
  if (Math.max(width, height) > MAX_SIDE || width * height > MAX_OUTPUT_PIXELS) {
    return `${count} frames of ${w}x${h} make an image of ${width}x${height} even at scale 1, over the ${MAX_SIDE}px limit. Ask for fewer frames.`;
  }
  return { cols, rows, scale: best, gutter, width, height };
}

/** Lay `count` frames of `w`x`h` RGBA out as one scaled RGBA image. */
export function composeSheet(
  pixels: Uint8Array,
  w: number,
  h: number,
  count: number,
  layout: SheetLayout,
  background: Background,
): Uint8Array {
  const { cols, scale, gutter, width, height } = layout;
  const out = new Uint8Array(width * height * 4);

  // Everything starts as gutter; frames are drawn over it.
  if (background.kind !== 'transparent') {
    for (let i = 0; i < out.length; i += 4) {
      out[i] = GUTTER_RGB[0];
      out[i + 1] = GUTTER_RGB[1];
      out[i + 2] = GUTTER_RGB[2];
      out[i + 3] = 255;
    }
  }

  const frameBytes = w * h * 4;
  for (let f = 0; f < count; f += 1) {
    const ox = (f % cols) * (w * scale + gutter);
    const oy = Math.floor(f / cols) * (h * scale + gutter);
    for (let y = 0; y < h * scale; y += 1) {
      const sy = Math.floor(y / scale);
      for (let x = 0; x < w * scale; x += 1) {
        const sx = Math.floor(x / scale);
        const si = f * frameBytes + (sy * w + sx) * 4;
        const di = ((oy + y) * width + ox + x) * 4;
        const a = pixels[si + 3];
        if (background.kind === 'transparent') {
          out[di] = pixels[si];
          out[di + 1] = pixels[si + 1];
          out[di + 2] = pixels[si + 2];
          out[di + 3] = a;
          continue;
        }
        const bg =
          background.kind === 'solid'
            ? background.rgb
            : (Math.floor(x / CHECKER_PX) + Math.floor(y / CHECKER_PX)) % 2 === 0
              ? CHECKER_A
              : CHECKER_B;
        const k = a / 255;
        out[di] = Math.round(pixels[si] * k + bg[0] * (1 - k));
        out[di + 1] = Math.round(pixels[si + 1] * k + bg[1] * (1 - k));
        out[di + 2] = Math.round(pixels[si + 2] * k + bg[2] * (1 - k));
        out[di + 3] = 255;
      }
    }
  }
  return out;
}

/** A still RGBA PNG. The chunk framing is `png.ts`; deflate is zlib's. */
export function encodePng(rgba: Uint8Array, w: number, h: number): Buffer {
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, w);
  view.setUint32(4, h);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const idat = deflateSync(filterScanlines(rgba, w, h));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', new Uint8Array(idat.buffer, idat.byteOffset, idat.byteLength)),
    chunk('IEND', new Uint8Array(0)),
  ]);
}
