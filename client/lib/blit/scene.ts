/**
 * Sketches inside sketches: `blit(ref, x, y)`.
 *
 * A saved sketch is a pattern plus the settings it declared, so placing one in
 * another is the same move as any constructor: evaluate it, and hand back a Pat.
 * What makes it more than `stack` is the context. The placed sketch runs in its
 * OWN world — its `size()` is the canvas its `mirror`, `center` and `grad` see,
 * its `cycle()` is what its `every` counts, its `ramp()` is what its digits
 * index, and its clock runs at its own `fps()` against the scene's. A 32x32 coin
 * that centres itself is still centred on its 32x32 when it sits at (40, 12) in
 * a 512x512 scene.
 *
 * Two contexts are stripped on the way in, both for the same reason: the inner
 * sketch has its own source. A paint probe must not reach its sprites, because
 * their literal ids index ANOTHER sketch's text, and the inspection pass must not
 * see its characters, because the scene's palette panel paints into the scene.
 * The instance itself answers `blit` probes, which is what scene mode clicks.
 *
 * The position is a mutable holder rather than two numbers baked into a closure,
 * so a drag can move an instance on screen with no re-evaluation per pointer
 * move; the source is rewritten once, on release. See BlitCanvas.
 */

import { isVisible, TRANSPARENT } from './color';
import { derive, defaultPalette, resolveRamp, Pat, type Ctx } from './pattern';
import type { SketchSettings } from './api';

/** A sketch reference as written: a name, or a numeric id. */
export type BlitRef = string | number;

/** The saved text a reference resolved to. */
export interface BlitSource {
  id: number;
  name: string;
  code: string;
}

/**
 * How the evaluator learns what a reference means.
 *
 * `loading` is a real answer, not an error: the editor fetches placed sketches
 * on demand, so the first evaluation of a scene usually meets references that
 * are on their way. They draw nothing until they arrive, and the page evaluates
 * again when they do.
 */
export type BlitResolution =
  | { kind: 'found'; source: BlitSource }
  | { kind: 'loading' }
  | { kind: 'error'; message: string };

export type BlitResolver = (ref: BlitRef) => BlitResolution;

/** Where an instance is. Mutable on purpose: see the file comment. */
export interface BlitPos {
  x: number;
  y: number;
}

/** One placed sketch, as the scene's evaluation found it. */
export interface BlitInstance {
  /** The tagged call's index, matching `BlitCall.id`. */
  id: number;
  ref: BlitRef;
  /** The resolved sketch, or null while it is still loading. */
  sketchId: number | null;
  name: string;
  w: number;
  h: number;
  pos: BlitPos;
  /** The call ran more than once (a loop), so no single position is its own. */
  repeated: boolean;
}

/** What the evaluator hands this module about a resolved child. */
export interface EmbeddedSketch {
  pattern: Pat;
  settings: SketchSettings;
}

/** Deepest nesting honoured: a scene of scenes of scenes is fine; forty is a mistake. */
export const BLIT_MAX_DEPTH = 8;

/** A reference as it reads in a message: `'Coin'` or `#12`. */
export function describeRef(ref: BlitRef): string {
  return typeof ref === 'number' ? `#${ref}` : `'${ref}'`;
}

/** Only a non-empty string or a positive integer names a sketch. */
export function validRef(ref: unknown): ref is BlitRef {
  if (typeof ref === 'string') return ref.trim().length > 0;
  return typeof ref === 'number' && Number.isInteger(ref) && ref > 0;
}

/**
 * The context a placed sketch sees, derived once per scene context.
 *
 * Memoised per CHILD rather than per instance, and that is a performance fix,
 * not tidiness: two instances of one coin share the child's pattern tree, whose
 * own `derive` caches hold one entry each. Handing them two different contexts
 * per pixel would make every one of those caches miss on every sample.
 */
const contexts = new WeakMap<EmbeddedSketch, (ctx: Ctx) => Ctx>();

function childContext(child: EmbeddedSketch): (ctx: Ctx) => Ctx {
  let found = contexts.get(child);
  if (found) return found;
  const { w, h, fps, cycle, ramp } = child.settings;
  const ramped = resolveRamp(ramp);
  const pal = defaultPalette();
  found = derive((ctx: Ctx): Ctx => ({
    w,
    h,
    fps,
    cycle,
    // Its own rate against the scene's: a 6fps flag in a 12fps scene still
    // waves at 6. Same rate, same frame, so the common case is exact.
    frame: fps === ctx.fps ? ctx.frame : Math.floor((ctx.frame * fps) / Math.max(1, ctx.fps)),
    pal,
    ramp: ramped,
    audio: ctx.audio,
  }));
  contexts.set(child, found);
  return found;
}

/**
 * Place a child sketch with its top-left corner at `pos`.
 *
 * The box is the child's size, like `shift` keeps its child's box: the position
 * is where it sits on the canvas, not part of how big it is.
 */
export function embed(child: EmbeddedSketch, pos: BlitPos, instanceId?: number): Pat {
  const { w, h } = child.settings;
  const inner = childContext(child);
  return new Pat(
    (x, y, ctx) => {
      const lx = x - pos.x;
      const ly = y - pos.y;
      if (lx < 0 || ly < 0 || lx >= w || ly >= h) return TRANSPARENT;
      const c = child.pattern.sample(lx, ly, inner(ctx));
      const probe = ctx.probe;
      if (probe !== undefined && probe.target === 'blit' && instanceId !== undefined) {
        if (probe.mode === 'any' || isVisible(c)) probe.hit = { sourceId: instanceId, col: lx, row: ly };
      }
      return c;
    },
    w,
    h,
  );
}

/** A coordinate argument: a finite number rounded to a pixel, else 0. */
export function coord(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : 0;
}
