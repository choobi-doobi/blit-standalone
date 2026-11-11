/**
 * Folders: the virtual file system sketches are filed in.
 *
 * A folder is a name and a parent. The tree lives in `folders.parent_id` and a
 * sketch's place in it in `sketches.folder_id`; NULL is the top level for both.
 * Everything that keeps the tree a tree is enforced here rather than in the
 * schema, and is the reason every write to either column goes through this file:
 *
 * - existence — a missing folder, parent or destination answers 404;
 * - no cycles — a folder cannot move inside itself or anything under it;
 * - unique names among siblings, case aside, like directories;
 * - deleting a folder never deletes a sketch. Its contents move up a level.
 */

import { Router, type Request, type Response } from 'express';
import { AppError, asyncHandler } from '../http.js';
import { db } from '../db.js';

import type { FoldersRow } from '../schema';

export const FOLDER_NAME_MAX = 120;

export type FolderRow = FoldersRow;



/** The statements a transaction and a bare call share. */
type Db = Pick<ReturnType<typeof db>, 'prepare'>;

export function parseFolderId(raw: unknown): number {
  const id = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(id) || id < 1 || String(id) !== String(raw).trim()) throw new AppError(400, 'Invalid folder id');
  return id;
}

export function validateFolderName(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new AppError(400, 'A folder needs a name');
  const name = value.trim();
  if (name.length > FOLDER_NAME_MAX) throw new AppError(400, `A folder name is at most ${FOLDER_NAME_MAX} characters`);
  return name;
}

/**
 * A destination as the body gives it: a folder id, or null for the top level.
 *
 * Only null means the top level. An absent field is the caller's to interpret
 * before it gets here, and `0`, `''` or `false` are refused rather than read as
 * "nowhere", because a typo that silently empties a sketch out of its folder is
 * worse than being told the value was wrong.
 */
export function parseFolderRef(raw: unknown, field: string): number | null {
  if (raw === null) return null;
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) {
    throw new AppError(400, `${field} must be a folder id, or null for the top level`);
  }
  return raw;
}

/** A folder the caller owns, or 404 — whether somebody else's exists is theirs to know. */
export function ownedFolder(id: number, on: Db = db()): FolderRow {
  const row = on.prepare('SELECT * FROM folders WHERE id = ?').get(id) as FolderRow | undefined;
  if (!row) throw new AppError(404, 'No such folder');
  return row;
}

/** A destination the caller may file things in: null, or a folder of their own. */
export function resolveDestination(raw: unknown, field: string, on: Db = db()): number | null {
  const id = parseFolderRef(raw, field);
  if (id !== null) ownedFolder(id, on);
  return id;
}

function siblingNamed(on: Db, parentId: number | null, name: string, except?: number): FolderRow | undefined {
  return on
    .prepare(
      `SELECT * FROM folders
        WHERE COALESCE(parent_id, 0) = ? AND name = ? COLLATE NOCASE AND id != ?`,
    )
    .get(parentId ?? 0, name, except ?? 0) as FolderRow | undefined;
}

function assertNameFree(on: Db, parentId: number | null, name: string, except?: number): void {
  const clash = siblingNamed(on, parentId, name, except);
  if (clash) throw new AppError(409, `A folder named “${clash.name}” is already there`);
}

/**
 * The first of `name`, `name (2)`, `name (3)`… that no sibling has.
 *
 * Only for moves the caller did not choose: when a deleted folder's children
 * move up and one of them meets a namesake. Refusing the delete over it would
 * make a folder undeletable for a reason the caller cannot see from where they
 * are standing.
 */
function freeName(on: Db, parentId: number | null, name: string, except: number): string {
  if (!siblingNamed(on, parentId, name, except)) return name;
  for (let n = 2; ; n += 1) {
    const suffix = ` (${n})`;
    const candidate = name.slice(0, FOLDER_NAME_MAX - suffix.length) + suffix;
    if (!siblingNamed(on, parentId, candidate, except)) return candidate;
  }
}

/**
 * Whether `folderId` is `candidate` or one of its ancestors — i.e. whether
 * putting `folderId` under `candidate` would make a loop.
 *
 * Walks up from the destination rather than down from the folder: one row per
 * level, and it stops at the top. The step cap is a guard against a loop that is
 * already in the table, which nothing here writes but a hand-edited row could.
 */
function wouldCycle(on: Db, folderId: number, candidate: number | null): boolean {
  let at = candidate;
  for (let steps = 0; at !== null && steps < 10_000; steps += 1) {
    if (at === folderId) return true;
    const row = on.prepare('SELECT parent_id FROM folders WHERE id = ?').get(at) as
      | { parent_id: number | null }
      | undefined;
    at = row?.parent_id ?? null;
  }
  return at !== null;
}

const router = Router();

// GET /api/blit/folders -> every folder the caller has, alphabetical.
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const rows = db()
      .prepare('SELECT * FROM folders ORDER BY name COLLATE NOCASE, id')
      .all();
    res.json({ success: true, data: rows });
  }),
);

// POST /api/blit/folders { name, parent_id? } -> 201 with the folder.
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const name = validateFolderName(req.body?.name);
    const row = db().transaction((tx) => {
      const parentId = req.body?.parent_id === undefined ? null : resolveDestination(req.body.parent_id, 'parent_id', tx);
      assertNameFree(tx, parentId, name);
      const result = tx.prepare('INSERT INTO folders (parent_id, name) VALUES (?, ?)').run(parentId, name);
      return tx.prepare('SELECT * FROM folders WHERE id = ?').get(result.lastInsertRowid);
    });
    res.status(201).json({ success: true, data: row });
  }),
);

// PATCH /api/blit/folders/:id { name?, parent_id? } -> rename, move, or both.
router.patch(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseFolderId(req.params.id);
    if (req.body?.name === undefined && req.body?.parent_id === undefined) {
      throw new AppError(400, 'Nothing to update. Send a name, a parent_id, or both.');
    }
    const nextName = req.body?.name === undefined ? undefined : validateFolderName(req.body.name);
    const row = db().transaction((tx) => {
      const existing = ownedFolder(id, tx);
      const parentId =
        req.body?.parent_id === undefined ? existing.parent_id : resolveDestination(req.body.parent_id, 'parent_id', tx);
      if (wouldCycle(tx, id, parentId)) throw new AppError(400, "A folder can't move inside itself");
      const name = nextName ?? existing.name;
      assertNameFree(tx, parentId, name, id);
      tx.prepare("UPDATE folders SET name = ?, parent_id = ?, updated_at = datetime('now') WHERE id = ?").run(
        name,
        parentId,
        id,
      );
      return tx.prepare('SELECT * FROM folders WHERE id = ?').get(id);
    });
    res.json({ success: true, data: row });
  }),
);

// DELETE /api/blit/folders/:id -> the folder goes; what was in it moves up a level.
router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseFolderId(req.params.id);
    const data = db().transaction((tx) => {
      const folder = ownedFolder(id, tx);
      const children = tx.prepare('SELECT * FROM folders WHERE parent_id = ? ORDER BY id').all(id) as FolderRow[];
      // Out of the way first, so a child named like the folder being deleted
      // (a "Sprites" inside "Sprites") can take its name rather than a suffix.
      tx.prepare('DELETE FROM folders WHERE id = ?').run(id);
      for (const child of children) {
        tx.prepare("UPDATE folders SET parent_id = ?, name = ?, updated_at = datetime('now') WHERE id = ?").run(
          folder.parent_id,
          freeName(tx, folder.parent_id, child.name, child.id),
          child.id,
        );
      }
      // `updated_at` untouched: moving a sketch is not editing it.
      const moved = tx
        .prepare('UPDATE sketches SET folder_id = ? WHERE folder_id = ?')
        .run(folder.parent_id, id);
      return { id, parent_id: folder.parent_id, moved_sketches: moved.changes, moved_folders: children.length };
    });
    res.json({ success: true, data });
  }),
);

export default router;
