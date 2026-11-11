/**
 * Exports. Everything happens in the browser: the pattern is already here, and
 * a round trip to the server would only add a way for the two renderers to
 * disagree.
 */

import { downloadBlob } from '../sdk/download';

import { encodeAseprite } from './aseprite';
import { createGifEncoder } from './gif';
import { renderSheet, renderToRgba, type RenderOptions, type RgbaBuffer } from './blit/render';
import type { Pat } from './blit/pattern';

/** Put an RGBA buffer on a canvas at natural size, nearest-neighbour scaled. */
export function toCanvas(data: RgbaBuffer, w: number, h: number, scale = 1): HTMLCanvasElement {
  const natural = document.createElement('canvas');
  natural.width = w;
  natural.height = h;
  natural.getContext('2d')?.putImageData(new ImageData(data, w, h), 0, 0);
  if (scale === 1) return natural;

  const scaled = document.createElement('canvas');
  scaled.width = w * scale;
  scaled.height = h * scale;
  const ctx = scaled.getContext('2d');
  if (ctx) {
    ctx.imageSmoothingEnabled = false; // the entire point of a pixel export
    ctx.drawImage(natural, 0, 0, scaled.width, scaled.height);
  }
  return scaled;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the PNG'))), 'image/png');
  });
}

/** Turn a sketch name into a safe file stem. */
export function fileStem(name: string): string {
  const stem = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return stem || 'sketch';
}

/** The current frame as a PNG, optionally scaled up for somewhere that wants pixels big. */
export async function exportFrame(
  pat: Pat,
  options: RenderOptions,
  name: string,
  scale = 1,
): Promise<void> {
  const data = renderToRgba(pat, options);
  const blob = await canvasToBlob(toCanvas(data, options.w, options.h, scale));
  downloadBlob(blob, `${fileStem(name)}-f${options.frame}${scale > 1 ? `@${scale}x` : ''}.png`);
}

/** One cycle laid out left to right as a spritesheet PNG. */
export async function exportSheet(
  pat: Pat,
  options: RenderOptions,
  name: string,
  frames?: number,
): Promise<void> {
  const sheet = renderSheet(pat, options, frames);
  const blob = await canvasToBlob(toCanvas(sheet.data, sheet.w, sheet.h));
  const count = Math.max(1, Math.round(frames ?? options.cycle));
  downloadBlob(blob, `${fileStem(name)}-sheet-${count}x${options.w}x${options.h}.png`);
}

/**
 * RGBA budget for Aseprite, which still retains the whole loop, and a target
 * for GIF zoom. GIF frames are encoded immediately, so a long loop can always
 * fall back to natural size without retaining every frame in memory.
 */
export const MAX_ANIMATION_PIXELS = 8_000_000;

/**
 * How far to scale an animated export up.
 *
 * A 32-square sketch exported at natural size is a thumbnail, so the zoom you
 * are working at is the right default. But zoom multiplies the cost by its
 * SQUARE, so rather than refusing a reasonable export outright, this reduces the
 * scale until the loop fits the target, with natural size as the minimum.
 * Streaming GIF encoding makes long loops at natural size affordable.
 */
export function animationScale(frames: number, w: number, h: number, zoom: number): number {
  const total = Math.max(1, frames) * Math.max(1, w) * Math.max(1, h);
  const fits = Math.floor(Math.sqrt(MAX_ANIMATION_PIXELS / total));
  return Math.max(1, Math.min(Math.max(1, Math.floor(zoom)), fits));
}

/**
 * Nearest-neighbour upscale, done here rather than through a canvas.
 *
 * A canvas round trip per frame would be slower, would need a DOM, and would
 * invite the smoothing that ruins a pixel export if `imageSmoothingEnabled` were
 * ever missed. This cannot be smoothed by accident.
 */
export function upscaleNearest(data: RgbaBuffer, w: number, h: number, scale: number): RgbaBuffer {
  if (scale <= 1) return data;
  const outW = w * scale;
  const out: RgbaBuffer = new Uint8ClampedArray(outW * h * scale * 4);
  for (let y = 0; y < h; y += 1) {
    const rowStart = y * scale * outW * 4;
    for (let x = 0; x < w; x += 1) {
      const from = (y * w + x) * 4;
      for (let dx = 0; dx < scale; dx += 1) {
        const to = rowStart + (x * scale + dx) * 4;
        out[to] = data[from];
        out[to + 1] = data[from + 1];
        out[to + 2] = data[from + 2];
        out[to + 3] = data[from + 3];
      }
    }
    // The first row of the block is built once and then repeated, which is the
    // whole saving over sampling every output pixel.
    const built = out.subarray(rowStart, rowStart + outW * 4);
    for (let dy = 1; dy < scale; dy += 1) out.set(built, rowStart + dy * outW * 4);
  }
  return out;
}

/**
 * One cycle as an animated GIF: the loop, playing, in one file that plays
 * everywhere. See `gif.ts` for what GIF's 256 colours and 1-bit alpha cost.
 */
export async function exportAnimation(
  pat: Pat,
  options: RenderOptions,
  name: string,
  zoom = 1,
  frames?: number,
): Promise<void> {
  const count = Math.max(1, Math.round(frames ?? options.cycle));
  const scale = animationScale(count, options.w, options.h, zoom);
  const encoder = createGifEncoder({ w: options.w * scale, h: options.h * scale, fps: options.fps });
  // Reuse natural pixels: addFrame consumes them before the next render.
  const data: RgbaBuffer = new Uint8ClampedArray(options.w * options.h * 4);
  for (let f = 0; f < count; f += 1) {
    // Let the busy state paint and the browser handle input between frames.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    renderToRgba(pat, { ...options, frame: options.frame + f }, data);
    encoder.addFrame(upscaleNearest(data, options.w, options.h, scale));
  }
  const blob = encoder.finish();
  downloadBlob(blob, `${fileStem(name)}-loop-${count}f${scale > 1 ? `@${scale}x` : ''}.gif`);
}

/**
 * One cycle as an `.aseprite` file: the sketch as a sprite you can keep working
 * on, with its frames and its timing intact.
 *
 * **Always at natural size**, unlike the GIF loop. Zoom is a way of looking at a
 * sketch, and baking it into a file meant for a pixel editor would hand the
 * artist a 4x bitmap with no way back to the grid they actually want to edit.
 * That also means there is no scale to reduce when a loop is too big, so a loop
 * past the budget is refused outright rather than quietly shrunk.
 */
export async function exportAseprite(
  pat: Pat,
  options: RenderOptions,
  name: string,
  frames?: number,
): Promise<void> {
  const count = Math.max(1, Math.round(frames ?? options.cycle));
  if (count * options.w * options.h > MAX_ANIMATION_PIXELS) {
    throw new Error(
      `That is too much to export at once: ${count} frames of ${options.w}x${options.h}. ` +
        'Shorten cycle() or size() and try again.',
    );
  }

  const rendered: RgbaBuffer[] = [];
  for (let f = 0; f < count; f += 1) {
    rendered.push(renderToRgba(pat, { ...options, frame: options.frame + f }));
  }

  const { blob } = await encodeAseprite({
    frames: rendered,
    w: options.w,
    h: options.h,
    fps: options.fps,
    name,
  });
  downloadBlob(blob, `${fileStem(name)}.aseprite`);
}

/** The sketch source itself, which is the actual document. */
export function exportSource(code: string, name: string): void {
  downloadBlob(new Blob([code], { type: 'text/javascript' }), `${fileStem(name)}.blit.js`);
}
