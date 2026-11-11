/**
 * Turning a sketch's text into a running pattern.
 *
 * The language is plain JavaScript with the algebra in scope, which is the same
 * bargain Strudel makes: no parser to learn, no dialect to maintain, and every
 * loop and helper function the host language already has.
 *
 * Two call shapes are accepted, and the evaluator works out which it has by
 * trying to compile the expression form first:
 *
 *   sprite(`..`).mirror('x')     // a bare expression IS the sketch
 *   size(32, 32); out(ship)      // statements, with an explicit sink
 *
 * `out()` wins over a returned value when both are present, so a sketch that
 * grows from one into the other keeps working mid-edit.
 *
 * This runs in the browser, in the user's own tab, on code the user typed — and
 * in one place on the server: bundled as a source string into
 * lib/renderSandbox.ts, which runs it in a locked-down child process for the
 * render route. No server module imports this file directly. The `new Function`
 * below is the only one in the plugin, and it is why the scope it compiles
 * against lives in `api.ts`: the server-side lint needs the NAMES and must not be
 * able to reach this file.
 */

import {
  DEFAULT_SETTINGS,
  SKETCH_NAMES,
  createSketchApi,
  type SketchSettings,
} from './api';
import { type Color } from './color';
import {
  expressionBody,
  siteFromError,
  statementBody,
  type CompiledForm,
  type Site,
} from './errorSite';
import { charsUsed, type SpriteGrid } from './grid';
import { type Palette } from './palettes';
import { observeRender, type RenderOptions } from './render';
import { scanSpriteLiterals, type BlitCall, type SpriteLiteral } from './source';
import { declarationsOf, siteOfOffset, syntaxSite } from './syntaxSite';
import { defaultPalette, empty, toPat, type Pat, type Patternish } from './pattern';
import {
  BLIT_MAX_DEPTH,
  coord,
  describeRef,
  embed,
  validRef,
  type BlitInstance,
  type BlitResolver,
} from './scene';

/**
 * The settings vocabulary is `api.ts`'s, because that is where the `size`/`fps`/
 * `cycle`/`ramp` functions that write it live. Re-exported here so the editor,
 * the inspector and the tests keep importing the language from one place.
 */
export { DEFAULT_SETTINGS, type SketchSettings };

/** One character in play, and what it actually drew. */
export interface CharUse {
  ch: string;
  /** `null` when nothing mapped it, so it drew nothing. */
  color: Color | null;
}

export interface Sketch {
  pattern: Pat;
  /** Which shape this compiled as, so a throw during the draw loop can be located. */
  form: CompiledForm;
  settings: SketchSettings;
  /** Editable sprite literals, in source order. Indexed by `SpriteHit.sourceId`. */
  literals: SpriteLiteral[];
  grids: Map<number, SpriteGrid>;
  /** Characters used across every sprite, with the color each resolved to. */
  chars: CharUse[];
  warnings: string[];
  /** Every `blit(` call in source order. Indexed by `BlitInstance.id`. */
  blits: BlitCall[];
  /** The placed sketches this evaluation actually built, by call. */
  instances: Map<number, BlitInstance>;
  /** Some placed sketch was still loading, so this should be evaluated again when it lands. */
  pending: boolean;
}

/** What a sketch may place, and where it sits in a nesting of placed sketches. */
export interface EvaluateOptions {
  /** How `blit()` references resolve. Absent: `blit()` is an error. */
  blits?: BlitResolver;
  /** The saved id of the sketch being evaluated, so it cannot place itself. */
  selfId?: number | null;
  /** The ids already being evaluated above this one. Internal to nesting. */
  chain?: number[];
  /** Placed sketches already evaluated in this pass, by id. Internal to nesting. */
  memo?: Map<number, Sketch>;
}

export class BlitError extends Error {
  readonly phase: 'compile' | 'run';
  /** Where in the sketch, when that could be established soundly. See errorSite. */
  readonly site: Site | null;

  constructor(message: string, phase: 'compile' | 'run', site: Site | null = null) {
    super(message);
    this.name = 'BlitError';
    this.phase = phase;
    this.site = site;
  }
}


const REDECLARED = /Identifier '([^']+)' has already been declared/;

/**
 * The trivial expression-form failure: a sketch of statements is not one
 * expression, so the wrapper's `return (` runs into the first semicolon and V8
 * says so. It is true and it is useless.
 */
const TRIVIAL_EXPRESSION_ERROR = /^Unexpected token ';'$/;

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Which of the two compile failures to report.
 *
 * Both forms are tried and both can fail, and for a long time the fallback
 * always reported the EXPRESSION form's error. For a sketch meant to be one
 * expression that is the right call. For a sketch of statements it is the worst
 * one available: the expression wrapper dies at the first `;` every time,
 * whatever is actually wrong, so the user was told "Unexpected token ';'" about
 * a semicolon that was perfectly fine while the real reason sat in the error
 * nobody looked at.
 *
 * The worst case was shadowing. Every API name is a parameter of the compiled
 * function, so `const grad = ...` is a redeclaration — a real, explainable
 * mistake, reported as a punctuation error with no line number, because the raw
 * buffer is valid JavaScript on its own and the grammar had nothing to add.
 */
function compileFailure(code: string, expressionError: unknown, statementError: unknown): BlitError {
  const statementMessage = messageOf(statementError);

  const redeclared = REDECLARED.exec(statementMessage);
  if (redeclared) {
    const name = redeclared[1];
    const declared = declarationsOf(code, name);
    if (SKETCH_NAMES.includes(name)) {
      return new BlitError(
        `'${name}' is already part of the language, so a sketch cannot declare it. Rename it.`,
        'compile',
        declared.length > 0 ? siteOfOffset(code, declared[0]) : null,
      );
    }
    // The sketch's own name, twice. The SECOND one is the mistake: the first was
    // fine until it arrived.
    return new BlitError(
      statementMessage,
      'compile',
      declared.length > 1 ? siteOfOffset(code, declared[declared.length - 1]) : syntaxSite(code),
    );
  }

  const expressionMessage = messageOf(expressionError);
  if (TRIVIAL_EXPRESSION_ERROR.test(expressionMessage)) {
    return new BlitError(statementMessage, 'compile', syntaxSite(code));
  }

  // The position comes from the grammar, not the engine: a SyntaxError out of
  // `new Function` has nothing positional in it. Measured, not assumed. Asked of
  // the ORIGINAL buffer, which is what the editor is showing.
  return new BlitError(expressionMessage, 'compile', syntaxSite(code));
}

/**
 * Compile and run a sketch.
 *
 * Throws `BlitError` with the phase, so the editor can say whether the code did
 * not parse or did not run. Both matter while live coding: one means you are
 * mid-keystroke, the other means the logic is wrong.
 */
export function evaluateSketch(code: string, options: EvaluateOptions = {}): Sketch {
  const scanned = scanSpriteLiterals(code);
  const grids = new Map<number, SpriteGrid>();

  const settings: SketchSettings = { ...DEFAULT_SETTINGS };
  const sink: { value: Patternish | undefined } = { value: undefined };

  const instances = new Map<number, BlitInstance>();
  let pending = false;
  const resolve = options.blits;
  const chain = options.chain ?? (options.selfId ? [options.selfId] : []);
  const memo = options.memo ?? new Map<number, Sketch>();

  const place = resolve
    ? (instanceId: number | undefined, ref: unknown, x: unknown, y: unknown): Pat => {
        if (!validRef(ref)) {
          throw new Error("blit() takes a sketch's name or id, then where it goes: blit('Coin', 12, 40).");
        }
        const pos = { x: coord(x), y: coord(y) };
        const record = (sketchId: number | null, name: string, w: number, h: number): void => {
          if (instanceId === undefined) return;
          const repeated = instances.has(instanceId);
          instances.set(instanceId, { id: instanceId, ref, sketchId, name, w, h, pos, repeated });
        };

        const resolution = resolve(ref);
        if (resolution.kind === 'loading') {
          pending = true;
          record(null, String(ref), 0, 0);
          return empty();
        }
        if (resolution.kind === 'error') throw new Error(resolution.message);

        const { source } = resolution;
        if (chain.includes(source.id)) {
          throw new Error(
            `blit(${describeRef(ref)}) places a sketch that places this one, so it would never finish drawing.`,
          );
        }
        if (chain.length >= BLIT_MAX_DEPTH) {
          throw new Error(`blit(${describeRef(ref)}) is nested more than ${BLIT_MAX_DEPTH} sketches deep.`);
        }

        let child = memo.get(source.id);
        if (!child) {
          try {
            child = evaluateSketch(source.code, { blits: resolve, chain: [...chain, source.id], memo });
          } catch (error) {
            throw new Error(`blit(${describeRef(ref)}): ${messageOf(error)}`);
          }
          memo.set(source.id, child);
        }
        if (child.pending) pending = true;
        record(source.id, source.name, child.settings.w, child.settings.h);
        return embed(child, pos, instanceId);
      }
    : undefined;

  const api = createSketchApi({ settings, grids, sink, place });

  const names = Object.keys(api);
  const values = names.map((n) => api[n]);

  let compiled: ((...args: unknown[]) => unknown) | undefined;
  let form: CompiledForm = 'expression';
  let expressionError: unknown;
  try {
    compiled = new Function(...names, expressionBody(scanned.code)) as (...args: unknown[]) => unknown;
  } catch (error) {
    expressionError = error;
  }

  if (!compiled) {
    try {
      compiled = new Function(...names, statementBody(scanned.code)) as (...args: unknown[]) => unknown;
      form = 'statement';
    } catch (statementError) {
      throw compileFailure(code, expressionError, statementError);
    }
  }

  let returned: unknown;
  try {
    returned = compiled(...values);
  } catch (error) {
    throw new BlitError(error instanceof Error ? error.message : String(error), 'run', siteFromError(error, form));
  }

  const produced = sink.value ?? returned;
  if (produced === undefined || produced === null) {
    throw new BlitError(
      'This sketch produced no pattern. End with a pattern expression, or call out(pattern).',
      'run',
    );
  }

  let pattern: Pat;
  try {
    pattern = toPat(produced as Patternish);
  } catch {
    throw new BlitError('This sketch produced something that is not a pattern.', 'run');
  }

  const { chars, warnings } = inspect(pattern, settings, grids);
  return {
    pattern,
    form,
    settings,
    literals: scanned.literals,
    grids,
    chars,
    warnings,
    blits: scanned.blits,
    instances,
    pending,
  };
}

/**
 * Learn the palette in play by rendering one frame with observation on.
 *
 * Measured, not inferred. A `.pal()` halfway down a chain is invisible to a
 * source scan but shows up here, and an unmapped character is reported because
 * it was actually asked for and actually missing.
 */
function inspect(
  pattern: Pat,
  settings: SketchSettings,
  grids: Map<number, SpriteGrid>,
): { chars: CharUse[]; warnings: string[] } {
  const options: RenderOptions = {
    w: settings.w,
    h: settings.h,
    frame: 0,
    fps: settings.fps,
    cycle: settings.cycle,
    pal: defaultPalette() as Palette,
    ramp: settings.ramp,
  };

  let observation;
  try {
    observation = observeRender(pattern, options);
  } catch {
    return { chars: [], warnings: [] };
  }

  // Source order, so the palette panel reads in the order the sketch introduces
  // characters rather than in whatever order the scanline happened to hit them.
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const grid of grids.values()) {
    for (const ch of charsUsed(grid)) {
      if (ch === ' ' || seen.has(ch)) continue;
      seen.add(ch);
      ordered.push(ch);
    }
  }
  for (const ch of observation.colors.keys()) {
    if (seen.has(ch)) continue;
    seen.add(ch);
    ordered.push(ch);
  }

  const chars: CharUse[] = ordered.map((ch) => ({ ch, color: observation.colors.get(ch) ?? null }));

  const unmapped = [...observation.unresolved].filter((ch) => ch !== '.');
  const warnings = unmapped.length
    ? [`No color for ${unmapped.map((c) => `'${c}'`).join(', ')}. Add it with .pal({ ... }).`]
    : [];

  return { chars, warnings };
}
