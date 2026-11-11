/**
 * The Blit pattern algebra.
 *
 * ONE type carries the whole language:
 *
 *   Pattern = (x, y, ctx) => Color
 *
 * A hand-drawn sprite literal is one constructor of that type. A generative
 * field is another. Because they are the same type, they compose with the same
 * operators, and that is the difference between this and a shader playground:
 * you can draw a character by hand and then dither a procedural gradient behind
 * it without leaving the algebra.
 *
 * The context carries what a pattern cannot know about itself: the canvas size
 * (so `mirror` and `jux` have an axis), the frame clock and cycle length (so the
 * time combinators port straight from Strudel), and the live palette (so `.pal`
 * is an ordinary combinator rather than a rebuild).
 *
 * `t` in the docs and in user-facing `fn()` callbacks is `ctx.frame`.
 */

import type { AudioFrame } from './audio';
import { alpha, isVisible, luma, over, parseColor, rgba, TRANSPARENT, type Color } from './color';
import { parseSpriteGrid, type SpriteGrid } from './grid';
import { LETTERS, RAMPS, resolveChar, shiftRamp, type Palette } from './palettes';

/** Which sprite cell produced a pixel. The bridge back to the source text. */
export interface SpriteHit {
  /** Index of the `sprite(...)` literal in the sketch source. */
  sourceId: number;
  col: number;
  row: number;
}

/**
 * `opaque` finds the cell behind a pixel you can see.
 * `any` also matches a transparent cell inside a sprite's footprint, which is
 * how clicking empty space inside a sprite paints there.
 */
export type ProbeMode = 'opaque' | 'any';

/**
 * What a probe is looking for. `sprite` (the default) finds the cell a paint
 * stroke edits; `blit` finds which placed sketch drew the pixel, for scene mode,
 * where a click picks up a whole `blit()` rather than one of its characters.
 * Only one kind records on any one pass, so a sprite inside a placed sketch can
 * never answer a paint probe with a literal id that belongs to another source.
 */
export type ProbeTarget = 'sprite' | 'blit';

export interface Probe {
  mode: ProbeMode;
  target?: ProbeTarget;
  /** For `blit` probes, `sourceId` is the placed instance and col/row are local to it. */
  hit: SpriteHit | null;
}

export interface Ctx {
  /** Canvas size in pixels. The axis for `mirror`, `jux` and `center`. */
  w: number;
  h: number;
  /** Absolute frame counter. Monotonic, integer. This is `t`. */
  frame: number;
  fps: number;
  /** Frames per cycle. `every`, `seq` and `euclid` are defined against this. */
  cycle: number;
  pal: Palette;
  ramp: Color[];
  /**
   * What the music is doing this frame. `SILENCE` unless a caller supplies one.
   *
   * REQUIRED rather than optional, and the reason is the language's own shape: a
   * sketch BODY runs exactly once per edit, so anything read at the top level is
   * frozen at build time. A reader that had to cope with `undefined` would push
   * that choice into every operator; a frozen default means `live()` is the only
   * construct that has to think about it at all.
   */
  audio: AudioFrame;
  /** Set only while resolving a click. Sampling is otherwise allocation-free. */
  probe?: Probe;
  /**
   * Set only on an inspection pass. Sprites report what each character actually
   * resolved to, which beats static analysis: an inner `.pal()` is invisible to
   * a source scan but shows up here because this is measured during a real
   * render, with the real contexts.
   */
  observe?: Observation;
}

/** What an inspection render learned about the characters in play. */
export interface Observation {
  /** Character to the color it resolved to, first occurrence winning. */
  colors: Map<string, Color>;
  /** Characters no palette or ramp covered, so they drew nothing. */
  unresolved: Set<string>;
}

export type SampleFn = (x: number, y: number, ctx: Ctx) => Color;

/**
 * What a chain of palette operators adds up to.
 *
 * The context flows DOWN the tree, so a naively nested `.pal()` would let the
 * innermost call win: `p.pal({ a: 'red' }).pal({ a: 'blue' })` would draw red,
 * and `p.ramp('pico8').palShift(1)` would shift the default ramp instead of the
 * pico8 one. Both read backwards.
 *
 * So adjacent palette operators FLATTEN into one wrapper, with the later (outer)
 * call winning, which is how a chain reads. A transform in between deliberately
 * breaks the chain, because at that point `.pal()` is scoping a subtree rather
 * than refining a sprite.
 */
interface CtxMod {
  pal?: Palette;
  ramp?: Color[];
  palShift?: number;
}

interface ModInfo {
  base: Pat;
  mod: CtxMod;
}

/**
 * A raw pattern function as a USER writes it: `(x, y, t)`, with the context as a
 * fourth argument for anyone who wants the canvas size or cycle length.
 */
export type UserFn = (x: number, y: number, t: number, ctx: Ctx) => unknown;

/** Anything the algebra will accept where a pattern is expected. */
export type Patternish = Pat | UserFn | string | number;

type PatTransform = (p: Pat) => Patternish;

const mod = (n: number, m: number): number => ((n % m) + m) % m;

/**
 * Strip the probe before sampling a child for a reason OTHER than "this is the
 * pixel".
 *
 * `outline` asks its child about four neighbours; `mask` asks a second pattern
 * whether to keep a pixel. Neither of those reads is the pixel being drawn, so
 * letting them record provenance would make a click land on whatever the last
 * neighbour lookup happened to touch. Only combinators that sample the child AT
 * the requested coordinate pass the probe through.
 */
function withoutProbe(ctx: Ctx): Ctx {
  return ctx.probe === undefined ? ctx : { ...ctx, probe: undefined };
}

/**
 * Deterministic 0-1 hash. Seeded noise has to be reproducible, otherwise a
 * sketch is a different picture every time you press run and you can't iterate
 * on it.
 */
function hash3(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** 4x4 ordered (Bayer) matrix, normalised to 0-1. The classic pixel-art dither. */
const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map((row) => row.map((v) => (v + 0.5) / 16));

/**
 * Derive a modified context, memoised on the incoming context's identity.
 *
 * `pal`, `ramp` and the clock operators all need to hand their child a changed
 * context, and doing that naively allocates one object PER PIXEL. A render pass
 * reuses one context object for every pixel, so a single-entry cache collapses
 * that to one allocation per frame. Probe passes build fresh contexts and simply
 * miss the cache, which is correct: they must never see a stale probe.
 *
 * Generic in what it caches, not only in `Ctx`: `live` memoises Ctx to Pat
 * through this same cache, which is what makes a per-frame rebuild one rebuild
 * per frame rather than one per pixel.
 */
export function derive<T>(change: (ctx: Ctx) => T): (ctx: Ctx) => T {
  let lastIn: Ctx | undefined;
  let lastOut: T | undefined;
  // A flag rather than an `undefined` sentinel: a derived Ctx is never
  // undefined, but a cached value of some other type legitimately could be, and
  // the sentinel would then rebuild on every single pixel.
  let has = false;
  return (ctx: Ctx): T => {
    if (ctx !== lastIn || !has) {
      lastIn = ctx;
      lastOut = change(ctx);
      has = true;
    }
    return lastOut as T;
  };
}

export class Pat {
  readonly sample: SampleFn;
  /** Intrinsic size, when the pattern has one. A sprite does; a field does not. */
  readonly w?: number;
  readonly h?: number;
  /** Set only on a palette wrapper, so an adjacent one can flatten into it. */
  readonly modInfo?: ModInfo;

  constructor(sample: SampleFn, w?: number, h?: number, modInfo?: ModInfo) {
    this.sample = sample;
    this.w = w;
    this.h = h;
    this.modInfo = modInfo;
  }

  /**
   * Add a palette change, merging into an adjacent one so the outer call wins.
   */
  private withMod(add: CtxMod): Pat {
    const prior = this.modInfo;
    const base = prior ? prior.base : this;
    const inner = prior ? prior.mod : {};
    const merged: CtxMod = {
      pal: inner.pal || add.pal ? { ...inner.pal, ...add.pal } : undefined,
      ramp: add.ramp ?? inner.ramp,
      palShift: add.palShift ?? inner.palShift,
    };

    const apply = derive((ctx: Ctx): Ctx => {
      let ramp = merged.ramp ?? ctx.ramp;
      if (merged.palShift !== undefined) {
        ramp = shiftRamp(ramp, Math.floor(ctx.frame / ctx.cycle) * merged.palShift);
      }
      return {
        ...ctx,
        pal: merged.pal ? { ...ctx.pal, ...merged.pal } : ctx.pal,
        ramp,
      };
    });

    return new Pat((x, y, ctx) => base.sample(x, y, apply(ctx)), base.w, base.h, { base, mod: merged });
  }

  /** Sample one pixel. `at(x, y, ctx)` is the whole interface. */
  at(x: number, y: number, ctx: Ctx): Color {
    return this.sample(x, y, ctx);
  }

  private width(ctx: Ctx): number {
    return this.w ?? ctx.w;
  }

  private height(ctx: Ctx): number {
    return this.h ?? ctx.h;
  }

  // ── Composition ───────────────────────────────────────────────────────────

  /**
   * Layer patterns. **Later arguments draw on top**, the way a layers list reads
   * bottom-up: `stack(sky, hills, ship)` puts the ship in front.
   */
  stack(...others: Patternish[]): Pat {
    return stack(this, ...others);
  }

  /** `p.over(q)`: q on top of p. Reads left-to-right as "p, then q over it". */
  over(other: Patternish): Pat {
    return stack(this, other);
  }

  /** `p.under(q)`: q behind p. */
  under(other: Patternish): Pat {
    return stack(other, this);
  }

  /** Move by whole pixels. Positive `dx` moves right, positive `dy` moves down. */
  shift(dx: number, dy: number): Pat {
    return new Pat((x, y, ctx) => this.sample(x - dx, y - dy, ctx), this.w, this.h);
  }

  /**
   * Strudel's `off`, in space: stack an offset copy UNDER the original,
   * optionally transformed on the way.
   *
   * This is why drop shadows, outlines and motion trails are one call:
   * `ship.off(1, 1, (p) => p.tint('#0008'))`.
   */
  off(dx: number, dy: number, transform?: PatTransform): Pat {
    const moved = this.shift(dx, dy);
    return stack(transform ? toPat(transform(moved)) : moved, this);
  }

  // ── Space ─────────────────────────────────────────────────────────────────

  /** Reflect, replacing the original. `'x'` flips left-right, `'y'` top-bottom. */
  flip(axis: 'x' | 'y' = 'x'): Pat {
    if (axis === 'x') {
      return new Pat((x, y, ctx) => this.sample(this.width(ctx) - 1 - x, y, ctx), this.w, this.h);
    }
    return new Pat((x, y, ctx) => this.sample(x, this.height(ctx) - 1 - y, ctx), this.w, this.h);
  }

  /**
   * Symmetry, not reflection: one half is mirrored ONTO the other, so you draw
   * half a face and get a whole one. `from` picks which half survives.
   */
  mirror(axis: 'x' | 'y' = 'x', from: 'low' | 'high' = 'low'): Pat {
    return new Pat(
      (x, y, ctx) => {
        const span = axis === 'x' ? this.width(ctx) : this.height(ctx);
        const v = axis === 'x' ? x : y;
        const half = span / 2;
        const keepLow = from === 'low';
        const inKeptHalf = keepLow ? v < half : v >= half;
        const source = inKeptHalf ? v : span - 1 - v;
        return axis === 'x' ? this.sample(source, y, ctx) : this.sample(x, source, ctx);
      },
      this.w,
      this.h,
    );
  }

  /**
   * Rotate clockwise. Multiples of 90 are exact (and swap width/height);
   * anything else is a nearest-neighbour rotation about the centre, which is
   * lossy in the way pixel rotation always is.
   */
  rot(degrees = 90): Pat {
    const deg = mod(Math.round(degrees), 360);
    if (deg === 0) return this;

    if (deg === 90) {
      return new Pat((x, y, ctx) => this.sample(y, this.height(ctx) - 1 - x, ctx), this.h, this.w);
    }
    if (deg === 180) {
      return new Pat(
        (x, y, ctx) => this.sample(this.width(ctx) - 1 - x, this.height(ctx) - 1 - y, ctx),
        this.w,
        this.h,
      );
    }
    if (deg === 270) {
      return new Pat((x, y, ctx) => this.sample(this.width(ctx) - 1 - y, x, ctx), this.h, this.w);
    }

    const rad = (-deg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return new Pat((x, y, ctx) => {
      const cx = (this.width(ctx) - 1) / 2;
      const cy = (this.height(ctx) - 1) / 2;
      const dx = x - cx;
      const dy = y - cy;
      return this.sample(Math.round(cos * dx - sin * dy + cx), Math.round(sin * dx + cos * dy + cy), ctx);
    });
  }

  /** Repeat forever, tiling on the pattern's own box (or the canvas). */
  tile(): Pat {
    return new Pat((x, y, ctx) => this.sample(mod(x, this.width(ctx)), mod(y, this.height(ctx)), ctx));
  }

  /** Nearest-neighbour integer upscale. Every pixel becomes an n x n block. */
  scale(n: number): Pat {
    const by = Math.max(1, Math.round(n));
    if (by === 1) return this;
    return new Pat(
      (x, y, ctx) => this.sample(Math.floor(x / by), Math.floor(y / by), ctx),
      this.w === undefined ? undefined : this.w * by,
      this.h === undefined ? undefined : this.h * by,
    );
  }

  /** Cut a window out, and make it the pattern's new box at the origin. */
  crop(x0: number, y0: number, w: number, h: number): Pat {
    return new Pat(
      (x, y, ctx) => (x >= 0 && x < w && y >= 0 && y < h ? this.sample(x + x0, y + y0, ctx) : TRANSPARENT),
      w,
      h,
    );
  }

  /** Centre the pattern's box on the canvas. */
  center(): Pat {
    return new Pat((x, y, ctx) => {
      const dx = Math.floor((ctx.w - this.width(ctx)) / 2);
      const dy = Math.floor((ctx.h - this.height(ctx)) / 2);
      return this.sample(x - dx, y - dy, ctx);
    });
  }

  // ── Masking ───────────────────────────────────────────────────────────────

  /** Keep only where `other` is visible. */
  mask(other: Patternish): Pat {
    const m = toPat(other);
    return new Pat(
      (x, y, ctx) => (isVisible(m.sample(x, y, withoutProbe(ctx))) ? this.sample(x, y, ctx) : TRANSPARENT),
      this.w,
      this.h,
    );
  }

  /** Erase where `other` is visible. The inverse of `mask`. */
  cut(other: Patternish): Pat {
    const m = toPat(other);
    return new Pat(
      (x, y, ctx) => (isVisible(m.sample(x, y, withoutProbe(ctx))) ? TRANSPARENT : this.sample(x, y, ctx)),
      this.w,
      this.h,
    );
  }

  // ── Color ─────────────────────────────────────────────────────────────────

  /**
   * Bind sprite characters to colors.
   *
   * An ordinary combinator, so it scopes to what it wraps: a `.pal()` on one
   * layer of a stack beats a `.pal()` on the stack as a whole. Chained calls
   * merge, with the later one winning.
   */
  pal(map: Record<string, string | number>): Pat {
    const resolved: Palette = {};
    for (const [ch, value] of Object.entries(map)) resolved[ch] = parseColor(value);
    return this.withMod({ pal: resolved });
  }

  /** Switch the digit ramp. `ramp('pico8')` or a list of colors. */
  ramp(nameOrColors: string | Array<string | number>): Pat {
    return this.withMod({ ramp: resolveRamp(nameOrColors) });
  }

  /**
   * Rotate the digit ramp by `n` every cycle: classic palette cycling, and the
   * cheapest animation in the language. Nothing about the sprite changes, only
   * which color each digit resolves to.
   */
  palShift(n = 1): Pat {
    return this.withMod({ palShift: n });
  }

  /**
   * Map the colors through a function, or through a from/to lookup.
   *
   * Transparent pixels stay transparent. A blanket `recolor(() => '#000')` means
   * "make this sprite black", not "fill the canvas with black", which is what
   * mapping the holes too would silently do. Use `stack(solid(c), p)` when a
   * background really is what you want.
   */
  recolor(mapping: ((c: Color) => Color | string | number) | Record<string, string | number>): Pat {
    let transform: (c: Color) => Color;
    if (typeof mapping === 'function') {
      transform = (c) => {
        const next = mapping(c);
        return typeof next === 'string' ? parseColor(next) : next >>> 0;
      };
    } else {
      const table = new Map<Color, Color>();
      for (const [from, to] of Object.entries(mapping)) table.set(parseColor(from), parseColor(to));
      transform = (c) => table.get(c) ?? c;
    }
    return new Pat(
      (x, y, ctx) => {
        const src = this.sample(x, y, ctx);
        return isVisible(src) ? transform(src) : TRANSPARENT;
      },
      this.w,
      this.h,
    );
  }

  /**
   * Replace the color while keeping the shape, multiplying the alphas. The
   * operator that makes shadows and silhouettes work.
   */
  tint(color: string | number): Pat {
    const c = parseColor(color);
    const [r, g, b, a] = [(c >>> 24) & 0xff, (c >>> 16) & 0xff, (c >>> 8) & 0xff, c & 0xff];
    return new Pat(
      (x, y, ctx) => {
        const src = this.sample(x, y, ctx);
        const sa = alpha(src);
        return sa === 0 ? TRANSPARENT : rgba(r, g, b, (sa * a) / 255);
      },
      this.w,
      this.h,
    );
  }

  /**
   * A one-pixel outline around everything visible, stacked underneath.
   *
   * This is the pixel-art chore that no GUI automates well and that costs one
   * call here. `diagonal` includes the corners (an 8-neighbour outline).
   */
  outline(color: string | number = '#000000', diagonal = false): Pat {
    const oc = parseColor(color);
    const neighbours = diagonal
      ? [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]
      : [[0, -1], [-1, 0], [1, 0], [0, 1]];

    // The ring records no provenance, and its neighbour lookups must not either:
    // an outline pixel has no source cell of its own, so a click there should
    // fall through to the transparent pass and paint the cell it sits on. That is
    // how clicking an edge grows the sprite.
    const ring = new Pat((x, y, ctx) => {
      const clean = withoutProbe(ctx);
      if (isVisible(this.sample(x, y, clean))) return TRANSPARENT;
      for (const [dx, dy] of neighbours) {
        if (isVisible(this.sample(x + dx, y + dy, clean))) return oc;
      }
      return TRANSPARENT;
    });

    return stack(ring, this);
  }

  /** Sugar for an offset, tinted copy underneath. */
  shadow(dx = 1, dy = 1, color: string | number = '#00000066'): Pat {
    return this.off(dx, dy, (p) => p.tint(color));
  }

  /**
   * Ordered (Bayer) dithering between two colors, thresholded on this pattern's
   * luminance. Feed it a gradient and you get the dithered ramp pixel art has
   * used to fake extra colors since the CGA era.
   */
  dither(dark: string | number = '#000000', light: string | number = '#ffffff'): Pat {
    const lo = parseColor(dark);
    const hi = parseColor(light);
    return new Pat(
      (x, y, ctx) => {
        const src = this.sample(x, y, ctx);
        if (!isVisible(src)) return TRANSPARENT;
        const threshold = BAYER4[mod(y, 4)][mod(x, 4)];
        return luma(src) / 255 > threshold ? hi : lo;
      },
      this.w,
      this.h,
    );
  }

  // ── Time ──────────────────────────────────────────────────────────────────

  /** Speed the clock up: the child sees `t * n`. */
  fast(n: number): Pat {
    if (n === 1) return this;
    const next = derive((ctx) => ({ ...ctx, frame: Math.floor(ctx.frame * n) }));
    return new Pat((x, y, ctx) => this.sample(x, y, next(ctx)), this.w, this.h);
  }

  /** Slow the clock down: each child frame is held `n` ticks. */
  slow(n: number): Pat {
    return this.fast(1 / n);
  }

  /** Apply `transform` on the first of every `n` cycles. Strudel's `every`. */
  every(n: number, transform: PatTransform): Pat {
    const steps = Math.max(1, Math.round(n));
    const changed = toPat(transform(this));
    return new Pat(
      (x, y, ctx) => {
        const cycles = Math.floor(ctx.frame / ctx.cycle);
        return (mod(cycles, steps) === 0 ? changed : this).sample(x, y, ctx);
      },
      this.w,
      this.h,
    );
  }

  /** Apply `transform` when the condition holds. A boolean, or `(t) => boolean`. */
  when(condition: boolean | ((frame: number, ctx: Ctx) => boolean), transform: PatTransform): Pat {
    const changed = toPat(transform(this));
    if (typeof condition === 'boolean') return condition ? changed : this;
    return new Pat(
      (x, y, ctx) => (condition(ctx.frame, ctx) ? changed : this).sample(x, y, ctx),
      this.w,
      this.h,
    );
  }

  /**
   * Divide the cycle between this pattern and the others, one slot each.
   * Strudel's `seq`, on the frame clock.
   */
  seq(...others: Patternish[]): Pat {
    const steps = [this, ...others.map(toPat)];
    return new Pat((x, y, ctx) => {
      const slot = ctx.cycle / steps.length;
      const index = mod(Math.floor(mod(ctx.frame, ctx.cycle) / slot), steps.length);
      return steps[index].sample(x, y, ctx);
    });
  }

  /**
   * Visible only on the onsets of a Euclidean rhythm across the cycle. Blinking
   * lights, thruster stutter, anything that should pulse unevenly.
   */
  euclid(pulses: number, steps: number): Pat {
    const p = Math.max(0, Math.round(pulses));
    const s = Math.max(1, Math.round(steps));
    return new Pat(
      (x, y, ctx) => {
        const step = mod(Math.floor((mod(ctx.frame, ctx.cycle) * s) / ctx.cycle), s);
        return mod(step * p, s) < p ? this.sample(x, y, ctx) : TRANSPARENT;
      },
      this.w,
      this.h,
    );
  }

  /**
   * Drop a fraction of pixels, deterministically. Grit, dissolves, static.
   * Same seed, same picture, every run.
   */
  degrade(amount = 0.5, seed = 0): Pat {
    return new Pat(
      (x, y, ctx) => (hash3(x, y, seed + ctx.frame) < amount ? TRANSPARENT : this.sample(x, y, ctx)),
      this.w,
      this.h,
    );
  }

  /** Freeze the clock at one frame. Useful for inspecting an animation. */
  hold(frame = 0): Pat {
    const next = derive((ctx) => ({ ...ctx, frame }));
    return new Pat((x, y, ctx) => this.sample(x, y, next(ctx)), this.w, this.h);
  }

  /**
   * Apply `transform` on a beat, and for `hold` seconds after it.
   *
   * Sugar over `when`, and a METHOD rather than a global on purpose: methods are
   * free. The operator lists are read off `Pat.prototype` at module load, so a
   * new operator reaches the lint, the lint route and the agent tool with
   * nothing to remember, and it can never collide with a name a stored sketch
   * declares, because it is only reachable after a dot.
   *
   * `hold` is in SECONDS, not frames. A sketch runs on its own `fps()` while
   * onsets arrive on the audio clock, so counting frames would mean one thing at
   * 12fps and another at 60.
   */
  onBeat(transform: PatTransform, hold = 0): Pat {
    const seconds = Number.isFinite(hold) ? Math.max(0, hold) : 0;
    return this.when((_frame, ctx) => ctx.audio.sinceBeat <= seconds, transform);
  }

  /**
   * Strudel's stereo trick, in space: the original on the left half of the
   * canvas, the transformed copy on the right. A free A/B comparison.
   *
   * Each half gets its OWN coordinate space and its own reported canvas width,
   * so both sides render a complete copy. Splitting by x alone instead would put
   * a centred sprite right on the seam, and you would see one object in two
   * colours rather than two objects to compare.
   */
  jux(transform: PatTransform): Pat {
    const other = toPat(transform(this));
    const halfCtx = derive((ctx: Ctx): Ctx => ({ ...ctx, w: Math.max(1, Math.floor(ctx.w / 2)) }));
    return new Pat((x, y, ctx) => {
      const half = Math.max(1, Math.floor(ctx.w / 2));
      const inner = halfCtx(ctx);
      return x < half ? this.sample(x, y, inner) : other.sample(x - half, y, inner);
    });
  }
}

// ── Coercion ────────────────────────────────────────────────────────────────

/**
 * Accept a pattern, a raw sample function, a color string, a one-line sprite
 * string, or a packed color number.
 *
 * The string case is deliberately forgiving: `'#e43b44'` is a fill and
 * `'..##..'` is a sprite, which keeps `stack(sky, '..##..')` readable.
 */
export function toPat(value: Patternish): Pat {
  if (value instanceof Pat) return value;
  if (typeof value === 'number') return solid(value);
  if (typeof value === 'function') return fn(value);
  if (typeof value === 'string') {
    if (!value.includes('\n')) {
      try {
        return solid(parseColor(value));
      } catch {
        /* not a color, so read it as a one-row sprite */
      }
    }
    return sprite(value);
  }
  throw new Error('Not a pattern');
}

// ── Constructors ────────────────────────────────────────────────────────────

/** Nothing. The identity for `stack`. */
export function empty(): Pat {
  return new Pat(() => TRANSPARENT);
}

/** One color, everywhere. */
export function solid(color: string | number): Pat {
  const c = parseColor(color);
  return new Pat(() => c);
}

/**
 * Wrap a raw function. The user-facing signature is `(x, y, t)`; the context is
 * a fourth argument for anyone who wants the canvas size or cycle length.
 *
 * Return a color string, or a packed color from `rgb` / `grey` / `hsl`.
 */
export function fn(f: UserFn): Pat {
  return new Pat((x, y, ctx) => {
    const value = f(x, y, ctx.frame, ctx);
    if (value === null || value === undefined || value === false) return TRANSPARENT;
    if (typeof value === 'string') return parseColor(value);
    if (typeof value === 'number') return value >>> 0;
    throw new Error('A fn() pattern must return a color string, a packed color, or nothing');
  });
}

/**
 * A sprite from an ASCII grid: the mini-notation.
 *
 * ASCII art is already how pixel artists have shared sprites for decades, so it
 * is the terse authoring form the language gets for free. `sourceId` is set by
 * the evaluator and is what makes a pixel on screen traceable back to one
 * character in the sketch.
 */
export function sprite(art: string, sourceId?: number): Pat {
  const grid = parseSpriteGrid(art);
  return spriteFromGrid(grid, sourceId);
}

/** Build a sprite pattern from an already-parsed grid. */
export function spriteFromGrid(grid: SpriteGrid, sourceId?: number): Pat {
  const { rows, width, height } = grid;

  return new Pat(
    (x, y, ctx) => {
      if (x < 0 || y < 0 || x >= width || y >= height) return TRANSPARENT;

      const row = rows[y];
      const ch = x < row.text.length ? row.text[x] : ' ';
      const resolved = resolveChar(ch, ctx.pal, ctx.ramp);
      const color = resolved ?? TRANSPARENT;

      const observe = ctx.observe;
      if (observe !== undefined && ch !== ' ') {
        if (resolved === undefined) observe.unresolved.add(ch);
        else if (!observe.colors.has(ch)) observe.colors.set(ch, resolved);
      }

      // Provenance. `opaque` records only pixels you can see; `any` also claims
      // transparent cells inside the footprint, so clicking a hole paints it.
      const probe = ctx.probe;
      if (probe !== undefined && sourceId !== undefined && probe.target !== 'blit') {
        if (probe.mode === 'any' || isVisible(color)) {
          probe.hit = { sourceId, col: x, row: y };
        }
      }

      return color;
    },
    width,
    height,
  );
}

/**
 * Layer patterns, later on top.
 *
 * The probe bookkeeping lives here because this is the only place where two
 * patterns compete for a pixel. Each layer gets its own sub-probe and the
 * topmost contributor wins, which is what makes click-to-paint land on the
 * sprite you actually see even through mirrors, offsets and rotations: the
 * transform combinators only move coordinates, so they pass provenance through
 * untouched.
 */
export function stack(...patterns: Patternish[]): Pat {
  const layers = patterns.map(toPat);
  if (layers.length === 0) return empty();
  if (layers.length === 1) return layers[0];

  // Take the box from whichever layers HAVE one, rather than demanding that all
  // of them do. `outline` stacks an unsized ring over a sized sprite, and
  // requiring agreement erased the sprite's box, which quietly broke every
  // `.outline().center()`: `center` fell back to the canvas size and shifted by
  // zero.
  const widths = layers.map((l) => l.w).filter((v): v is number => v !== undefined);
  const heights = layers.map((l) => l.h).filter((v): v is number => v !== undefined);

  return new Pat(
    (x, y, ctx) => {
      const probe = ctx.probe;
      let out = TRANSPARENT;
      let hit: SpriteHit | null = null;

      for (const layer of layers) {
        if (probe === undefined) {
          const c = layer.sample(x, y, ctx);
          if (c !== TRANSPARENT) out = over(c, out);
          continue;
        }

        const sub: Probe = { mode: probe.mode, target: probe.target, hit: null };
        const c = layer.sample(x, y, { ...ctx, probe: sub });
        const contributes = probe.mode === 'any' ? sub.hit !== null : isVisible(c);
        if (c !== TRANSPARENT) out = over(c, out);
        if (contributes && sub.hit !== null) hit = sub.hit;
      }

      if (probe !== undefined && hit !== null) probe.hit = hit;
      return out;
    },
    widths.length > 0 ? Math.max(...widths) : undefined,
    heights.length > 0 ? Math.max(...heights) : undefined,
  );
}

/**
 * One pattern per frame, cycling. The animation constructor.
 *
 * `frames(a, b, c).slow(4)` holds each for four ticks, because `slow` divides
 * the clock the frame index is read from.
 */
export function frames(...patterns: Patternish[]): Pat {
  const steps = patterns.map(toPat);
  if (steps.length === 0) return empty();
  return new Pat((x, y, ctx) => steps[mod(Math.floor(ctx.frame), steps.length)].sample(x, y, ctx));
}

/**
 * Rebuild the pattern every frame, from the music.
 *
 * The one construct that makes a NUMBER reactive, and it exists because of how
 * a sketch runs: the BODY runs exactly once per edit, not once per frame. So
 * `solid(grey(a.bass * 255))` written at the top level would read as reactive
 * and render as a still, with `a.bass` sampled once when you pressed save and
 * never again. `live` moves the read inside the frame:
 *
 *   out(live((a) => solid(grey(a.bass * 255))));
 *
 * The callback order mirrors `fn`'s `(x, y, t, ctx)`: the thing you came for,
 * then the clock, then the escape hatch.
 *
 * `w` and `h` are not optional decoration. A pattern's intrinsic box is read at
 * CONSTRUCT time (`stack` takes the max of its layers' boxes, `center` and
 * `crop` read it) and the box of a child that has not been built yet is not
 * knowable. Reporting nothing silently falls back to the canvas size, which is
 * the exact class of bug the `stack` comment above records having fixed once
 * already.
 *
 * Cost: ONE rebuild per frame whatever the pixel count, because `derive`
 * memoises on the context's identity and a render pass reuses one context for
 * every pixel. A spritesheet rebuilds once per frame of the sheet; a probe pass
 * misses the cache once per probe mode, which is correct.
 */
export function live(
  build: (a: AudioFrame, t: number, ctx: Ctx) => Patternish,
  w?: number,
  h?: number,
): Pat {
  const rebuild = derive((ctx: Ctx) => toPat(build(ctx.audio, ctx.frame, ctx)));
  // The probe is deliberately NOT stripped: this samples its child at the
  // requested coordinate, so provenance is genuinely this pixel's and
  // click-to-paint keeps working through a live wrapper.
  return new Pat((x, y, ctx) => rebuild(ctx).sample(x, y, ctx), w, h);
}

/** A checkerboard. The quick backdrop, and a way to see your transforms. */
export function checker(a: string | number = '#222222', b: string | number = '#2c2c2c', size = 1): Pat {
  const ca = parseColor(a);
  const cb = parseColor(b);
  const s = Math.max(1, Math.round(size));
  return new Pat((x, y) => ((Math.floor(x / s) + Math.floor(y / s)) % 2 === 0 ? ca : cb));
}

/**
 * A linear gradient across the canvas at `angle` degrees. Rarely the final
 * image: pair it with `.dither()` to get something that belongs in a sprite.
 */
/**
 * A linear gradient across the canvas at `angle` degrees, 0 pointing right.
 *
 * Rarely the final image: pair it with `.dither()` to get something that belongs
 * in a sprite rather than in a screensaver.
 */
export function grad(from: string | number = '#000000', to: string | number = '#ffffff', angle = 90): Pat {
  const c0 = parseColor(from);
  const c1 = parseColor(to);
  const rad = (angle * Math.PI) / 180;
  const ux = Math.cos(rad);
  const uy = Math.sin(rad);

  // The projection range depends only on the canvas, so compute it once per size
  // rather than once per pixel.
  let cachedFor = '';
  let lo = 0;
  let span = 1;

  return new Pat((x, y, ctx) => {
    const key = `${ctx.w}x${ctx.h}`;
    if (key !== cachedFor) {
      cachedFor = key;
      const corners = [[0, 0], [ctx.w - 1, 0], [0, ctx.h - 1], [ctx.w - 1, ctx.h - 1]];
      let min = Infinity;
      let max = -Infinity;
      for (const [cx, cy] of corners) {
        const p = ux * cx + uy * cy;
        if (p < min) min = p;
        if (p > max) max = p;
      }
      lo = min;
      span = max - min || 1;
    }
    const k = Math.min(1, Math.max(0, (ux * x + uy * y - lo) / span));
    return mixColors(c0, c1, k);
  });
}

function mixColors(a: Color, b: Color, k: number): Color {
  const lerp = (p: number, q: number): number => p + (q - p) * k;
  return rgba(
    lerp((a >>> 24) & 0xff, (b >>> 24) & 0xff),
    lerp((a >>> 16) & 0xff, (b >>> 16) & 0xff),
    lerp((a >>> 8) & 0xff, (b >>> 8) & 0xff),
    lerp(a & 0xff, b & 0xff),
  );
}

/** Seeded value noise as greys. Feed it to `.dither()` or `.recolor()`. */
export function noise(seed = 0, animated = false): Pat {
  return new Pat((x, y, ctx) => {
    const v = hash3(x, y, animated ? seed + ctx.frame : seed);
    return rgba(v * 255, v * 255, v * 255, 255);
  });
}

/** A filled circle of radius `r`, box `(2r+1)` square, centre at `(r, r)`. */
export function circle(r: number, color: string | number = '#ffffff'): Pat {
  const c = parseColor(color);
  const rr = r * r;
  const span = Math.max(1, Math.round(r * 2 + 1));
  return new Pat(
    (x, y) => {
      const dx = x - r;
      const dy = y - r;
      return dx * dx + dy * dy <= rr ? c : TRANSPARENT;
    },
    span,
    span,
  );
}

/** A filled rectangle at the origin. */
export function rect(w: number, h: number, color: string | number = '#ffffff'): Pat {
  const c = parseColor(color);
  return new Pat((x, y) => (x >= 0 && y >= 0 && x < w && y < h ? c : TRANSPARENT), w, h);
}

/** Resolve a ramp name, or a literal list of colors. */
export function resolveRamp(nameOrColors: string | Array<string | number>): Color[] {
  if (Array.isArray(nameOrColors)) return nameOrColors.map((c) => parseColor(c));
  const found = RAMPS[nameOrColors];
  if (!found) throw new Error(`Unknown ramp: ${nameOrColors}. Try ${Object.keys(RAMPS).join(', ')}.`);
  return found;
}

/** The palette every sketch starts from. */
export function defaultPalette(): Palette {
  return { ...LETTERS };
}
