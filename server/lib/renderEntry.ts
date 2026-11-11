/**
 * The engine, packaged to run one render inside the server's sandbox.
 *
 * Bundled by `scripts/generate-render-runtime.mjs` into a source STRING
 * (`lib/renderRuntime.generated.ts`) with `globalName: 'BlitRender'`, and run by
 * `lib/renderSandbox.ts` inside a `vm` context of a locked-down child process.
 * It is the same evaluator and renderer the editor uses, so a picture an agent
 * is shown is the picture a person would see.
 *
 * Only strings cross this boundary, in both directions. `render` takes JSON and
 * answers one string: a JSON header line, then the frames' RGBA bytes as a
 * latin1 string. No object is ever handed across, because a host object inside
 * the context is how a vm sandbox is escaped.
 */

import { matchRef, type LibraryRow } from '../../client/lib/blitLibrary.js';
import { BlitError, evaluateSketch } from '../../client/lib/blit/evaluate.js';
import { renderToRgba } from '../../client/lib/blit/render.js';
import type { BlitResolver, BlitSource } from '../../client/lib/blit/scene.js';

export interface RenderInput {
  code: string;
  selfId: number | null;
  frame: number;
  count: number;
  /** The caller's sketch list, for resolving `blit()` references by name or id. */
  rows: LibraryRow[];
  /** Placed sketches fetched so far, by id. */
  sources: Record<string, { name: string; code: string }>;
}

export type RenderHeader =
  | { ok: true; w: number; h: number; fps: number; cycle: number; frames: number; warnings: string[] }
  | { ok: false; missing: number[] }
  | { ok: false; error: string; phase: 'compile' | 'run'; line: number | null; column: number | null };

function resolverFor(input: RenderInput, missing: Set<number>): BlitResolver {
  return (ref) => {
    const row = matchRef(input.rows, ref);
    if (typeof row === 'string') return { kind: 'error', message: row };
    const source = input.sources[String(row.id)];
    if (!source) {
      missing.add(row.id);
      return { kind: 'loading' };
    }
    const found: BlitSource = { id: row.id, name: source.name, code: source.code };
    return { kind: 'found', source: found };
  };
}

function fail(error: unknown, phase: 'compile' | 'run'): string {
  const site = error instanceof BlitError ? error.site : null;
  const header: RenderHeader = {
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    phase: error instanceof BlitError ? error.phase : phase,
    line: site?.line ?? null,
    column: site?.column ?? null,
  };
  return `${JSON.stringify(header)}\n`;
}

export function render(json: string): string {
  const input = JSON.parse(json) as RenderInput;
  const missing = new Set<number>();

  let sketch;
  try {
    sketch = evaluateSketch(input.code, { blits: resolverFor(input, missing), selfId: input.selfId });
  } catch (error) {
    return fail(error, 'compile');
  }
  if (sketch.pending) {
    const header: RenderHeader = { ok: false, missing: [...missing] };
    return `${JSON.stringify(header)}\n`;
  }

  const { w, h, fps, cycle, ramp } = sketch.settings;
  const parts: string[] = [];
  try {
    for (let f = 0; f < input.count; f += 1) {
      const rgba = renderToRgba(sketch.pattern, { w, h, fps, cycle, ramp, frame: input.frame + f });
      // Chunked: spreading a whole 512x512 frame into one call overflows the stack.
      for (let i = 0; i < rgba.length; i += 8192) {
        parts.push(String.fromCharCode(...rgba.subarray(i, i + 8192)));
      }
    }
  } catch (error) {
    return fail(error, 'run');
  }

  const header: RenderHeader = { ok: true, w, h, fps, cycle, frames: input.count, warnings: sketch.warnings };
  return `${JSON.stringify(header)}\n${parts.join('')}`;
}
