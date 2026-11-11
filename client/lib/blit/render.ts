/**
 * Sampling a pattern into pixels.
 *
 * Rendering is the boring half on purpose: walk the grid, call `at`, unpack the
 * color. The buffer is reusable so the animation loop does not allocate a new
 * one sixty times a second.
 */

import { SILENCE, type AudioFrame } from './audio';
import { alpha, blue, green, red, type Color } from './color';
import {
  defaultPalette,
  resolveRamp,
  type Ctx,
  type Observation,
  type Pat,
  type Probe,
  type ProbeTarget,
  type SpriteHit,
} from './pattern';
import type { Palette } from './palettes';

/**
 * An RGBA pixel buffer.
 *
 * Pinned to `ArrayBuffer` rather than the default `ArrayBufferLike` because
 * `ImageData` refuses a `SharedArrayBuffer`-backed view, and this buffer's only
 * destination is an `ImageData`.
 */
export type RgbaBuffer = Uint8ClampedArray<ArrayBuffer>;

export interface RenderOptions {
  w: number;
  h: number;
  /** The frame to sample: `t`. */
  frame: number;
  fps: number;
  /** Frames per cycle. */
  cycle: number;
  pal?: Palette;
  ramp?: Color[] | string;
  /**
   * What the music is doing at this frame. Omitted means `SILENCE`, which is
   * what keeps every existing render deterministic and byte-reproducible.
   */
  audio?: AudioFrame;
}

/** Build the context a render pass hands to the pattern tree. */
export function makeCtx(o: RenderOptions, probe?: Probe, observe?: Observation): Ctx {
  return {
    w: Math.max(1, Math.round(o.w)),
    h: Math.max(1, Math.round(o.h)),
    frame: Math.floor(o.frame),
    fps: o.fps,
    cycle: Math.max(1, Math.round(o.cycle)),
    pal: o.pal ?? defaultPalette(),
    ramp: typeof o.ramp === 'string' ? resolveRamp(o.ramp) : (o.ramp ?? resolveRamp('default')),
    audio: o.audio ?? SILENCE,
    probe,
    observe,
  };
}

/**
 * Render one frame purely to learn which characters resolved to which colors.
 *
 * The palette panel is built from this rather than from reading the source,
 * because a `.pal()` buried in a chain is real and a source scan would miss it.
 */
export function observeRender(pat: Pat, o: RenderOptions): Observation {
  const observation: Observation = { colors: new Map(), unresolved: new Set() };
  const ctx = makeCtx(o, undefined, observation);
  for (let y = 0; y < ctx.h; y += 1) {
    for (let x = 0; x < ctx.w; x += 1) pat.at(x, y, ctx);
  }
  return observation;
}

/**
 * Sample the pattern into an RGBA buffer, row major, four bytes per pixel.
 *
 * Pass `out` back in on the next frame to reuse it.
 */
export function renderToRgba(pat: Pat, o: RenderOptions, out?: RgbaBuffer): RgbaBuffer {
  const ctx = makeCtx(o);
  const { w, h } = ctx;
  const buffer: RgbaBuffer = out && out.length === w * h * 4 ? out : new Uint8ClampedArray(w * h * 4);

  let i = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const c = pat.at(x, y, ctx);
      buffer[i] = red(c);
      buffer[i + 1] = green(c);
      buffer[i + 2] = blue(c);
      buffer[i + 3] = alpha(c);
      i += 4;
    }
  }

  return buffer;
}

/**
 * Which sprite cell is behind the pixel at `(x, y)`.
 *
 * Two passes, and the order is the feature:
 *
 *   1. `opaque` asks which sprite drew the pixel you can see. Through mirrors,
 *      offsets, rotations and layers, because the transform combinators only
 *      move coordinates and pass provenance through untouched.
 *   2. `any` runs only when the first found nothing, and claims a transparent
 *      cell inside a sprite's footprint. That is what lets you click a hole in a
 *      sprite, or just inside its outline, and paint there.
 *
 * `null` means the click landed on something with no source cell (a generated
 * field, or empty canvas), so there is nothing to edit.
 *
 * With `target: 'blit'` the same two passes answer which placed sketch is under
 * the pixel instead: the one you can see, else the one whose box it falls in.
 * `sourceId` is then the instance, as numbered by the source scanner.
 */
export function probeAt(
  pat: Pat,
  o: RenderOptions,
  x: number,
  y: number,
  target: ProbeTarget = 'sprite',
): SpriteHit | null {
  for (const mode of ['opaque', 'any'] as const) {
    const probe: Probe = { mode, target, hit: null };
    const ctx = makeCtx(o, probe);
    pat.at(Math.floor(x), Math.floor(y), ctx);
    if (probe.hit !== null) return probe.hit;
  }
  return null;
}

/**
 * Render `count` consecutive frames side by side: a spritesheet.
 *
 * Default `count` is one cycle, which is almost always the loop you want to
 * export.
 */
export function renderSheet(pat: Pat, o: RenderOptions, count?: number): { data: RgbaBuffer; w: number; h: number } {
  const frames = Math.max(1, Math.round(count ?? o.cycle));
  const w = Math.max(1, Math.round(o.w));
  const h = Math.max(1, Math.round(o.h));
  const sheetWidth = w * frames;
  const data: RgbaBuffer = new Uint8ClampedArray(sheetWidth * h * 4);

  for (let f = 0; f < frames; f += 1) {
    const frame = renderToRgba(pat, { ...o, frame: o.frame + f });
    for (let y = 0; y < h; y += 1) {
      const from = y * w * 4;
      const to = (y * sheetWidth + f * w) * 4;
      data.set(frame.subarray(from, from + w * 4), to);
    }
  }

  return { data, w: sheetWidth, h };
}
