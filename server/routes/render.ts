/**
 * `POST /api/blit/render` — a sketch as a PNG, for an agent to look at.
 *
 * Lint can say whether a sketch runs; only a picture says whether it looks
 * right. The editor is where a person sees that, and an agent has no editor, so
 * before this route agents were writing their own imitations of the engine to
 * render frames. This renders with the real one, run in the sandbox described
 * in `lib/renderSandbox.ts` — read that before changing anything here.
 *
 * Either a saved sketch (`id`) or unsaved source (`code`), so a draft can be
 * looked at before it is saved. Scenes resolve `blit()` against the caller's own
 * sketches, the same way the editor does: evaluate, fetch what it asked for,
 * evaluate again.
 *
 * Answers `image/png` bytes. Failures are JSON errors as everywhere else; a
 * sketch that does not run is a 422 carrying the engine's message and position.
 *
 * A POST for the same reason as the lint: 200k of source does not fit on a GET.
 */

import { Router, type Request, type Response } from 'express';
import { AppError, asyncHandler } from '../http.js';
import { db } from '../db.js';

import { BLIT_MAX_DEPTH } from '../../client/lib/blit/scene.js';
import type { LibraryRow } from '../../client/lib/blitLibrary.js';
import { composeSheet, encodePng, layoutSheet, MAX_SCALE, parseBackground } from '../lib/renderImage.js';
import { runSandboxed, SandboxError, type SandboxResult } from '../lib/renderSandbox.js';

import { ownedSketch, parseId, validateCode } from './sketches.js';

export const MAX_FRAMES = 16;
/** The largest canvas `size()` allows, so the most pixels one frame can be. */
const MAX_FRAME_BYTES = 512 * 512 * 4;
/** Renders running at once; each is a whole Node process. */
const MAX_CONCURRENT = 3;

let running = 0;



function intIn(value: unknown, name: string, min: number, max: number, fallback?: number): number | undefined {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new AppError(400, `${name} must be a whole number from ${min} to ${max}`);
  }
  return value;
}

const router = Router();

router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body ?? {};

    const id = body.id === undefined || body.id === null ? null : parseId(body.id);
    if (id === null && body.code === undefined) throw new AppError(400, 'Send id (a saved sketch) or code (source to render)');
    const saved = id === null ? null : ownedSketch(id);
    const code = body.code === undefined ? (saved?.code ?? '') : validateCode(body.code);

    const frame = intIn(body.frame, 'frame', 0, 1_000_000, 0) as number;
    const count = intIn(body.count, 'count', 1, MAX_FRAMES, 1) as number;
    const scale = intIn(body.scale, 'scale', 1, MAX_SCALE);
    const background = parseBackground(body.background);
    if (typeof background === 'string') throw new AppError(400, background);

    if (running >= MAX_CONCURRENT) throw new AppError(429, 'Too many renders at once. Try again in a moment.');
    running += 1;
    let result: SandboxResult;
    try {
      const rows = db()
        .prepare('SELECT id, name, updated_at FROM sketches')
        .all() as LibraryRow[];
      const sources: Record<string, { name: string; code: string }> = {};
      // One pass per level of nesting at most: each pass fetches everything
      // the last one asked for.
      for (let pass = 0; ; pass += 1) {
        result = await runSandboxed(
          { code, selfId: id, frame, count, rows, sources },
          { maxPixelBytes: MAX_FRAME_BYTES * count },
        );
        if (result.header.ok || !('missing' in result.header)) break;
        if (pass > BLIT_MAX_DEPTH) throw new AppError(422, 'The scene kept asking for more sketches to place.');
        for (const missingId of result.header.missing) {
          const row = ownedSketch(missingId);
          sources[String(missingId)] = { name: row.name, code: row.code };
        }
      }
    } catch (error) {
      if (error instanceof SandboxError) throw new AppError(422, error.message);
      throw error;
    } finally {
      running -= 1;
    }

    if (!('pixels' in result)) {
      const failed = result.header;
      if ('missing' in failed) throw new AppError(422, 'The scene could not load the sketches it places.');
      const where = failed.line === null ? '' : ` (line ${failed.line}, column ${failed.column})`;
      throw new AppError(422, `The sketch did not ${failed.phase === 'compile' ? 'compile' : 'run'}: ${failed.error}${where}`);
    }
    const { header, pixels } = result;

    const layout = layoutSheet(header.w, header.h, count, scale);
    if (typeof layout === 'string') throw new AppError(400, layout);
    const sheet = composeSheet(pixels, header.w, header.h, count, layout, background);
    const png = encodePng(sheet, layout.width, layout.height);

    // Headers a person with curl can read; the body is only the image.
    res.setHeader('X-Blit-Size', `${header.w}x${header.h}`);
    res.setHeader('X-Blit-Frames', `${frame}-${frame + count - 1} of cycle ${header.cycle} at ${header.fps}fps`);
    res.setHeader('X-Blit-Scale', String(layout.scale));
    if (header.warnings.length > 0) res.setHeader('X-Blit-Warnings', header.warnings.join(' | ').replace(/[^\x20-\x7e]/g, '?'));
    res.type('image/png').send(png);
  }),
);

export default router;
