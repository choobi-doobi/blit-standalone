/**
 * The saved sketches a scene can place, fetched as they are asked for.
 *
 * The evaluator is synchronous and a sketch's code is not in the list response,
 * so `blit('Coin')` cannot fetch anything itself. The resolver answers from what
 * is cached, reports `loading` for the rest, and records what it was asked for;
 * the page fetches that and evaluates again. Two evaluations for a new scene,
 * one for every edit after.
 *
 * The cache is keyed on `updated_at` from the list, so saving the coin in
 * another tab — or in this one — reaches every scene the next time the list is
 * read, rather than the scene drawing the coin as it was when first fetched.
 */

import type { BlitRef, BlitResolution, BlitResolver, BlitSource } from './blit/scene';
import { describeRef } from './blit/scene';

/** The fields of a list row this needs. */
export interface LibraryRow {
  id: number;
  name: string;
  updated_at: string;
}

type Cached = { stamp: string; source: BlitSource } | { stamp: string; error: string };

export interface BlitLibrary {
  /**
   * A resolver over `rows`, the user's sketch list. `undefined` while the list
   * is still loading, which makes every reference `loading`. Ids it could not
   * answer from cache are added to `missing`.
   */
  resolver: (rows: readonly LibraryRow[] | undefined, missing: Set<number>) => BlitResolver;
  /** Fetch these sketches into the cache. Resolves when all have landed or failed. */
  load: (ids: Iterable<number>, rows: readonly LibraryRow[]) => Promise<void>;
  /** The cached source for a sketch, if it is current against `row`. */
  cached: (row: LibraryRow) => BlitSource | null;
}

/** Match a reference to one row, or say why it cannot be. */
export function matchRef(rows: readonly LibraryRow[], ref: BlitRef): LibraryRow | string {
  if (typeof ref === 'number') {
    return rows.find((row) => row.id === ref) ?? `No saved sketch has the id ${ref}.`;
  }
  const wanted = ref.trim();
  let found = rows.filter((row) => row.name === wanted);
  // A name typed with different capitals is still clearly that sketch, as long
  // as only one sketch answers to it.
  if (found.length === 0) found = rows.filter((row) => row.name.toLowerCase() === wanted.toLowerCase());
  if (found.length === 0) return `No saved sketch is called ${describeRef(wanted)}.`;
  if (found.length > 1) {
    return `${found.length} saved sketches are called ${describeRef(wanted)}. Place one by its id instead, as blit(${found[0].id}, x, y).`;
  }
  return found[0];
}

export function createBlitLibrary(fetchSketch: (id: number) => Promise<{ name: string; code: string }>): BlitLibrary {
  const cache = new Map<number, Cached>();
  const inflight = new Map<string, Promise<void>>();

  const current = (row: LibraryRow): Cached | undefined => {
    const hit = cache.get(row.id);
    return hit && hit.stamp === row.updated_at ? hit : undefined;
  };

  return {
    resolver: (rows, missing) =>
      (ref: BlitRef): BlitResolution => {
        if (!rows) return { kind: 'loading' };
        const row = matchRef(rows, ref);
        if (typeof row === 'string') return { kind: 'error', message: row };
        const hit = current(row);
        if (!hit) {
          missing.add(row.id);
          return { kind: 'loading' };
        }
        return 'error' in hit ? { kind: 'error', message: hit.error } : { kind: 'found', source: hit.source };
      },

    load: async (ids, rows) => {
      const jobs: Promise<void>[] = [];
      for (const id of ids) {
        const row = rows.find((r) => r.id === id);
        if (!row || current(row)) continue;
        const key = `${id}@${row.updated_at}`;
        let job = inflight.get(key);
        if (!job) {
          job = fetchSketch(id)
            .then((sketch) => {
              cache.set(id, { stamp: row.updated_at, source: { id, name: sketch.name, code: sketch.code } });
            })
            .catch(() => {
              cache.set(id, { stamp: row.updated_at, error: `Couldn't load ${describeRef(row.name)} to place it.` });
            })
            .finally(() => inflight.delete(key));
          inflight.set(key, job);
        }
        jobs.push(job);
      }
      await Promise.all(jobs);
    },

    cached: (row) => {
      const hit = current(row);
      return hit && 'source' in hit ? hit.source : null;
    },
  };
}

/**
 * The drag type a sketch row carries out of the explorer, so the canvas can take
 * it as "place this here". A type of its own rather than `text/plain`, which
 * the row already sets to its name for anything outside the page.
 */
export const SKETCH_DRAG_TYPE = 'application/x-blit-sketch';

/** Whether a drag is a sketch row. Readable during dragover, when the data is not. */
export function carriesSketch(transfer: DataTransfer | null): boolean {
  return !!transfer && Array.from(transfer.types ?? []).includes(SKETCH_DRAG_TYPE);
}

/** The sketch id a drop carries, if it is a sketch row. */
export function sketchFromDrop(transfer: DataTransfer | null): number | null {
  if (!transfer) return null;
  const id = Number.parseInt(transfer.getData(SKETCH_DRAG_TYPE), 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}
