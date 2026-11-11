/**
 * Saved sketches: the plugin's only persistent state.
 *
 * Validation lives in `validateName` / `validateCode` / `validateZoom` rather
 * than inline in the handlers, so the route tests can pin the limits directly and
 * the two write paths cannot drift apart.
 */

import { Router, type Request, type Response } from 'express';
import { AppError, asyncHandler } from '../http.js';
import { db } from '../db.js';

// Row shape, kept in step with server/migrations.
import type { SketchesRow } from '../schema';

// The zoom steps are the editor's vocabulary, and this is the same list the
// chips in the View section are built from: a value the editor cannot select is
// one this route will not store either.
import { DEFAULT_ZOOM, ZOOMS, isZoom } from '../../client/lib/zoom.js';

import { lintSketch } from '../../client/lib/blit/lint.js';

import { resolveDestination } from './folders.js';

export const NAME_MAX = 120;
export const CODE_MAX = 200_000;

export type SketchRow = SketchesRow;



export function parseId(raw: unknown): number {
  const id = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(id) || id < 1) throw new AppError(400, 'Invalid sketch id');
  return id;
}

export function validateName(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new AppError(400, 'A sketch needs a name');
  }
  const name = value.trim();
  if (name.length > NAME_MAX) throw new AppError(400, `A sketch name is at most ${NAME_MAX} characters`);
  return name;
}

export function validateCode(value: unknown): string {
  if (typeof value !== 'string') throw new AppError(400, 'A sketch needs code');
  if (value.length > CODE_MAX) throw new AppError(400, `A sketch is at most ${CODE_MAX} characters`);
  return value;
}

/**
 * The zoom the canvas opens this sketch at.
 *
 * Restricted to the steps rather than clamped to a range: a stored 5 would open
 * with no chip lit and nothing to click to get back to it, which is worse than
 * being told the value is not one of the six.
 */
export function validateZoom(value: unknown): number {
  if (!isZoom(value)) throw new AppError(400, `Zoom must be one of ${ZOOMS.join(', ')}`);
  return value;
}

/** Read one sketch, or 404. */
export function ownedSketch(id: number): SketchRow {
  const row = db()
    .prepare('SELECT * FROM sketches WHERE id = ?')
    .get(id) as SketchRow | undefined;
  if (!row) throw new AppError(404, 'No such sketch');
  return row;
}

const router = Router();

// GET /api/blit/sketches -> the user's sketches, newest edit first, without code.
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const rows = db()
      .prepare(
        `SELECT id, name, folder_id, created_at, updated_at
           FROM sketches
          ORDER BY updated_at DESC, id DESC`,
      )
      .all();
    res.json({ success: true, data: rows });
  }),
);

// GET /api/blit/sketches/:id -> one sketch, code included.
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    res.json({ success: true, data: ownedSketch(parseId(req.params.id), ) });
  }),
);

// POST /api/blit/sketches -> create.
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const name = validateName(req.body?.name);
    const code = validateCode(req.body?.code ?? '');
    // Omitted means the column's default, which is the zoom the editor opens at.
    const zoom = req.body?.zoom === undefined ? DEFAULT_ZOOM : validateZoom(req.body.zoom);
    // Omitted means the top level, which is where every sketch was before folders.
    const folderId = req.body?.folder_id === undefined ? null : resolveDestination(req.body.folder_id, 'folder_id');
    const result = db()
      .prepare('INSERT INTO sketches (name, code, zoom, folder_id) VALUES (?, ?, ?, ?)')
      .run(name, code, zoom, folderId);
    const row = db().prepare('SELECT * FROM sketches WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ success: true, data: row });
  }),
);

// PATCH /api/blit/sketches/:id -> rename, or save new code, or both.
router.patch(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseId(req.params.id);

    // Validate before opening the transaction, so a bad request never starts one.
    if (req.body?.name === undefined && req.body?.code === undefined && req.body?.zoom === undefined) {
      throw new AppError(400, 'Nothing to update. Send a name, code, zoom, or any combination.');
    }
    const nextName = req.body?.name === undefined ? undefined : validateName(req.body.name);
    const nextCode = req.body?.code === undefined ? undefined : validateCode(req.body.code);
    const nextZoom = req.body?.zoom === undefined ? undefined : validateZoom(req.body.zoom);

    // Read, merge and write as one unit. A partial patch fills the missing half
    // from the stored row, so two saves landing together would otherwise each
    // merge against the same pre-image and the second would erase the first.
    const row = db().transaction((tx) => {
      const existing = ownedSketch(id);
      tx.prepare(
        "UPDATE sketches SET name = ?, code = ?, zoom = ?, updated_at = datetime('now') WHERE id = ?",
      ).run(nextName ?? existing.name, nextCode ?? existing.code, nextZoom ?? existing.zoom, id);
      return tx.prepare('SELECT * FROM sketches WHERE id = ?').get(id);
    });
    res.json({ success: true, data: row });
  }),
);

export const EDITS_MAX = 50;

export interface SketchEdit {
  find: string;
  replace: string;
  all: boolean;
}

export function validateEdits(value: unknown): SketchEdit[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new AppError(400, 'Send edits: a non-empty list of { find, replace, all? }');
  }
  if (value.length > EDITS_MAX) throw new AppError(400, `At most ${EDITS_MAX} edits in one call`);
  return value.map((raw, i) => {
    const edit = raw as { find?: unknown; replace?: unknown; all?: unknown } | null;
    if (typeof edit?.find !== 'string' || edit.find.length === 0) {
      throw new AppError(400, `Edit ${i + 1}: find must be a non-empty string`);
    }
    if (typeof edit.replace !== 'string') throw new AppError(400, `Edit ${i + 1}: replace must be a string`);
    if (edit.all !== undefined && typeof edit.all !== 'boolean') {
      throw new AppError(400, `Edit ${i + 1}: all must be true or false`);
    }
    return { find: edit.find, replace: edit.replace, all: edit.all === true };
  });
}

function countOf(haystack: string, needle: string): number {
  let count = 0;
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + needle.length)) count += 1;
  return count;
}

/**
 * Apply find/replace edits in order, each to the result of the one before.
 *
 * Exact text, not patterns: a sprite literal's spaces and newlines are its grid,
 * so the only safe match is a literal one. A find that matches nowhere, or more
 * than once without `all`, refuses the whole list — applying the rest would save
 * a sketch the caller never saw. The count is in the message so the caller can
 * widen the find or say `all`.
 */
export function applyEdits(code: string, edits: SketchEdit[]): { code: string; replacements: number } {
  let next = code;
  let replacements = 0;
  edits.forEach((edit, i) => {
    const found = countOf(next, edit.find);
    if (found === 0) {
      throw new AppError(409, `Edit ${i + 1}: find text not found in the sketch${i > 0 ? ' (after the edits before it)' : ''}. Nothing was saved.`);
    }
    if (found > 1 && !edit.all) {
      throw new AppError(
        409,
        `Edit ${i + 1}: find text matches ${found} places. Include more surrounding text so it matches one, or set all: true. Nothing was saved.`,
      );
    }
    next = edit.all ? next.split(edit.find).join(edit.replace) : next.replace(edit.find, () => edit.replace);
    replacements += edit.all ? found : 1;
  });
  return { code: validateCode(next), replacements };
}

// PATCH /api/blit/sketches/:id/edit { edits } -> find/replace inside the saved code.
//
// For an agent tweaking a long sketch: resending 200 lines to change one colour
// costs the whole file every time. Answers the sketch WITHOUT its code, plus a
// lint of the result, because the caller already knows what it changed and the
// next thing it needs to know is whether the sketch still runs.
router.patch(
  '/:id/edit',
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseId(req.params.id);
    const edits = validateEdits(req.body?.edits);

    const { row, replacements } = db().transaction((tx) => {
      const existing = ownedSketch(id);
      const applied = applyEdits(existing.code, edits);
      tx.prepare("UPDATE sketches SET code = ?, updated_at = datetime('now') WHERE id = ?").run(
        applied.code,
        id,
      );
      return { row: tx.prepare('SELECT * FROM sketches WHERE id = ?').get(id) as SketchRow, replacements: applied.replacements };
    });
    const { code, ...rest } = row;
    const lint = lintSketch(code);
    res.json({
      success: true,
      data: { ...rest, replacements, length: code.length, lint: { ok: lint.ok, diagnostics: lint.diagnostics } },
    });
  }),
);

// PUT /api/blit/sketches/:id/folder { folder_id } -> file it in a folder, or at the top level with null.
//
// Its own route rather than a PATCH field because PATCH is an edit: it bumps
// `updated_at`, and the list is ordered by that, so filing a sketch away would
// jump it to the top of the list as if it had just been worked on.
router.put(
  '/:id/folder',
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseId(req.params.id);
    if (req.body?.folder_id === undefined) {
      throw new AppError(400, 'Send folder_id: a folder id, or null for the top level');
    }
    const row = db().transaction((tx) => {
      ownedSketch(id);
      const folderId = resolveDestination(req.body.folder_id, 'folder_id', tx);
      tx.prepare('UPDATE sketches SET folder_id = ? WHERE id = ?').run(folderId, id);
      return tx.prepare('SELECT * FROM sketches WHERE id = ?').get(id);
    });
    res.json({ success: true, data: row });
  }),
);

// DELETE /api/blit/sketches/:id
router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseId(req.params.id);
    ownedSketch(id);
    db().prepare('DELETE FROM sketches WHERE id = ?').run(id);
    res.status(204).end();
  }),
);

export default router;
