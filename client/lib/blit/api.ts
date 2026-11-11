/**
 * What a sketch has in scope, and the names of it.
 *
 * Extracted from `evaluate.ts` for one reason: the names are needed somewhere the
 * evaluator must never go. The lint endpoint runs on the server and checks a
 * sketch's identifiers against this vocabulary, and a server that imported the
 * evaluator would be a server holding a `new Function` over text a user typed.
 * The API and the list of its names live here instead, so `lint.ts` can import
 * the vocabulary while the only `new Function` in the plugin stays in the
 * browser half of the bundle. See README, "Storage and scope".
 *
 * `SKETCH_NAMES` is READ OFF the real object rather than written out beside it.
 * A hand-kept list is the classic way for a lint to start lying about the
 * language: add an operator, forget the list, and the lint reports the new name
 * as a typo. Here there is nothing to forget.
 */

import { grey, hsl, parseColor, rgba } from './color';
import { text } from './font';
import { parseSpriteGrid, type SpriteGrid } from './grid';
import { RAMPS } from './palettes';
import {
  checker,
  circle,
  empty,
  fn,
  frames,
  grad,
  live,
  noise,
  rect,
  resolveRamp,
  solid,
  spriteFromGrid,
  sprite as spriteOf,
  stack,
  Pat,
  type Patternish,
} from './pattern';

export interface SketchSettings {
  w: number;
  h: number;
  fps: number;
  /** Frames per cycle: the unit `every`, `seq` and `euclid` are defined against. */
  cycle: number;
  ramp: string;
}

export const DEFAULT_SETTINGS: SketchSettings = { w: 32, h: 32, fps: 12, cycle: 8, ramp: 'default' };

/**
 * Clamp one setting a sketch declared.
 *
 * Local on purpose: this file is shared by the browser and the server, so it
 * imports nothing from either side.
 */
function clampSetting(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * The three things a sketch writes to while it runs.
 *
 * Passed in rather than owned here because the evaluator has to read them back
 * afterwards: the settings the sketch declared, the sprite grids it built (so a
 * click can be resolved to a cell), and whatever it handed to `out()`.
 */
export interface SketchApiState {
  settings: SketchSettings;
  grids: Map<number, SpriteGrid>;
  /** A holder, not a value: `out()` assigns into it from inside the sketch. */
  sink: { value: Patternish | undefined };
  /**
   * Places a saved sketch: what `blit()` calls. Supplied by the evaluator, which
   * owns resolving references and nesting; absent where there is no library of
   * sketches to place from, and then `blit()` says so rather than drawing nothing.
   */
  place?: (instanceId: number | undefined, ref: unknown, x: unknown, y: unknown) => Pat;
}

/** Why `blit()` cannot work where nothing supplied a way to place one. */
export const NO_LIBRARY = 'blit() places a saved sketch, and this surface has no saved sketches to place from.';

/** Everything a sketch can name, bound to one run's state. */
export function createSketchApi(state: SketchApiState): Record<string, unknown> {
  const { settings, grids, sink, place } = state;
  const placed = (instanceId: number | undefined, ref: unknown, x: unknown, y: unknown): Pat => {
    if (!place) throw new Error(NO_LIBRARY);
    return place(instanceId, ref, x, y);
  };
  return {
    // Sprites. `__spriteAt` is what the scanner rewrites tagged calls into; the
    // plain `sprite` stays available for grids built at runtime (which are not
    // clickable, having no fixed home in the source).
    __spriteAt: (id: number, art: string): Pat => {
      const grid = parseSpriteGrid(art);
      grids.set(id, grid);
      return spriteFromGrid(grid, id);
    },
    sprite: (art: string): Pat => spriteOf(art),

    // Scenes. `blit(ref, x, y)` places another saved sketch, by name or id, with
    // its top-left corner at (x, y). Tagged like `sprite(`, so scene mode can
    // pick an instance up; the plain name is for calls the scanner never saw.
    __blitAt: (id: number, ref: unknown, x?: unknown, y?: unknown): Pat => placed(id, ref, x, y),
    blit: (ref: unknown, x?: unknown, y?: unknown): Pat => placed(undefined, ref, x, y),
    // `stack` by another name, for the layer list a scene is: scene mode inserts
    // into the first `scene(` it finds, so naming it is how a sketch says where.
    scene: stack,

    // Constructors.
    solid,
    fill: solid,
    empty,
    fn,
    frames,
    live,
    stack,
    checker,
    grad,
    noise,
    circle,
    rect,
    text,

    // Colors, for generative patterns.
    rgb: rgba,
    rgba,
    grey,
    gray: grey,
    hsl,
    color: parseColor,

    // The named ramps, by object and by name.
    ramps: RAMPS,

    // Settings. Called for effect; the last call wins.
    size: (w: number, h?: number): void => {
      settings.w = clampSetting(w, 1, 512, DEFAULT_SETTINGS.w);
      settings.h = clampSetting(h ?? w, 1, 512, settings.w);
    },
    fps: (n: number): void => {
      settings.fps = clampSetting(n, 1, 60, DEFAULT_SETTINGS.fps);
    },
    cycle: (n: number): void => {
      settings.cycle = clampSetting(n, 1, 256, DEFAULT_SETTINGS.cycle);
    },
    ramp: (name: string): void => {
      resolveRamp(name); // throws with the list of valid names
      settings.ramp = name;
    },

    /** The explicit sink. Returns its argument so `out(p)` also works inline. */
    out: (p: Patternish): Patternish => {
      sink.value = p;
      return p;
    },
  };
}

/** A throwaway state, for asking the API what its names are. */
function probeState(): SketchApiState {
  return { settings: { ...DEFAULT_SETTINGS }, grids: new Map(), sink: { value: undefined } };
}

/**
 * Every name a sketch has in scope, in the order `createSketchApi` declares them.
 *
 * This is also the argument list `new Function` is built with, so the order is
 * load-bearing only in that it must match between names and values — which it
 * does by both coming from this one object.
 */
export const SKETCH_NAMES: readonly string[] = Object.freeze(Object.keys(createSketchApi(probeState())));

/**
 * The names worth telling somebody about: `SKETCH_NAMES` without the internals.
 *
 * `__spriteAt` is in scope but is not part of the language — it is what the
 * source scanner rewrites `sprite(` into. A lint accepts it (a sketch that
 * somehow names it would still run) but never suggests it, and the docs never
 * mention it.
 */
export const SKETCH_VOCABULARY: readonly string[] = Object.freeze(
  SKETCH_NAMES.filter((n) => !n.startsWith('__')),
);

/**
 * Which of those names build a pattern.
 *
 * Used by the lint to decide whether `x.foo()` is a method call on a pattern —
 * and so whether `foo` has to be one of `PAT_MEMBERS` — or a method on some
 * other object it has no business checking. `Math.max` must not be second-
 * guessed; `sprite(art).mirrror('x')` must be.
 *
 * Hand-written, unlike `SKETCH_NAMES`, because "does this return a Pat" cannot
 * be read off the object without calling the functions. The drift it allows is
 * benign in one direction only: a new constructor missing from this set means a
 * method typo after it goes UNREPORTED, never that a correct call is reported.
 * `api.test.ts` still fails when the vocabulary grows without this being
 * revisited, so the omission cannot pass quietly.
 */
export const PAT_CONSTRUCTORS: ReadonlySet<string> = new Set([
  '__spriteAt',
  'sprite',
  '__blitAt',
  'blit',
  'scene',
  'solid',
  'fill',
  'empty',
  'fn',
  'frames',
  'live',
  'stack',
  'checker',
  'grad',
  'noise',
  'circle',
  'rect',
  'text',
  // `out(p)` returns its argument, so a chain may continue off it.
  'out',
]);

/**
 * Everything reachable on a pattern: the class's methods and an instance's own
 * fields, read off the real `Pat` rather than listed.
 *
 * `empty()` is the cheapest instance there is, and the fields (`sample`, `w`,
 * `h`, `modInfo`) are assigned in the constructor, so a prototype walk alone
 * would miss them and the lint would report `sprite(art).w` as a mistake.
 */
export const PAT_MEMBERS: ReadonlySet<string> = new Set([
  ...Object.getOwnPropertyNames(Pat.prototype),
  ...Object.getOwnPropertyNames(empty()),
  // A Pat is an object, so a sketch may legitimately reach Object.prototype.
  ...Object.getOwnPropertyNames(Object.prototype),
]);

/**
 * The members of `Pat` that answer something OTHER than a pattern, so a chain
 * ends at them.
 *
 * Stated as the exception list rather than as the chainable list, because the
 * algebra's rule is that an operator returns a pattern — that is what makes them
 * compose. A new operator added without touching this file is therefore treated
 * correctly by default, where a chainable allowlist would silently stop checking
 * everything after it.
 *
 * `at` answers a Color, `width` and `height` answer numbers, and the four
 * instance fields are data. `api.test.ts` calls the three methods and proves
 * they are not patterns, so a rename here cannot pass unnoticed.
 */
const PAT_TERMINAL: ReadonlySet<string> = new Set(['at', 'width', 'height', 'sample', 'w', 'h', 'modInfo']);

/** The members a pattern answers another pattern from, so a chain continues. */
export const PAT_CHAINABLE: ReadonlySet<string> = new Set(
  Object.getOwnPropertyNames(Pat.prototype).filter((n) => n !== 'constructor' && !PAT_TERMINAL.has(n)),
);

/**
 * Machinery that happens to be on the prototype but is not part of the language.
 *
 * `private` is a TypeScript idea and is gone by the time anything can read the
 * prototype, so there is no way to derive this. Only the ADVERTISED list is
 * filtered: a sketch that somehow calls one of these is still let through by
 * `PAT_MEMBERS` and still chains through `PAT_CHAINABLE`, because reporting a
 * method that genuinely exists would be the lint being wrong about the code.
 * Exported only so `api.test.ts` can assert each name is really on the
 * prototype: a rename would otherwise leave a stale entry filtering nothing,
 * which no assertion about the FILTERED list can see.
 */
export const PAT_INTERNAL: ReadonlySet<string> = new Set(['withMod']);

/**
 * The operators worth telling a caller about: `PAT_CHAINABLE` without the
 * machinery. This is what the lint route answers with, and it is the only place
 * a caller with no browser can learn the algebra's surface.
 */
export const PAT_OPERATORS: readonly string[] = Object.freeze(
  [...PAT_CHAINABLE].filter((n) => !PAT_INTERNAL.has(n)).sort(),
);
