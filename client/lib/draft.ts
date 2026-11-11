/**
 * The unsaved buffer, kept across a reload.
 *
 * Blit is somewhere you type experimentally, so the buffer is the most valuable
 * thing on the page and it used to live only in React state: a refresh threw it
 * away while the toolbar was actively badging it "edited". Panel widths survived
 * a reload and the sketch did not.
 *
 * Two decisions are load-bearing.
 *
 * A draft records the text it was typed ON TOP OF (`base`). Without it, restoring
 * is a guess: if the saved sketch changed in another tab, silently reinstating a
 * draft written against the old text is a clobber, and silently dropping it is
 * data loss. With it, the two cases are distinguishable and both can be reported
 * honestly. See `draftRestore`.
 *
 * A draft is only written when the buffer DIFFERS from what it is measured
 * against, and the same effect clears it when they agree. That is what makes a
 * debounced write safe: a timer that fires after a save completes finds the two
 * equal and removes the draft instead of resurrecting one. Guarding on "is there
 * anything to preserve" rather than cancelling timers means the store is
 * self-correcting rather than order-dependent.
 *
 * Every access is wrapped, like `panelState.ts`: `localStorage` throws in a
 * private window, comes back empty with site data cleared, and can be over quota.
 * None of that is a reason for the editor to fail to mount, so the fallback is
 * always "behave as it did before drafts existed".
 */

const PREFIX = 'blit.draft.';

/** The key an unsaved sketch drafts under, before it has an id. */
export const NEW_DRAFT_KEY = `${PREFIX}new`;

/** Long enough that a keystroke is not a storage round-trip, short enough to survive a crash. */
export const DRAFT_DEBOUNCE_MS = 500;

export interface Draft {
  name: string;
  code: string;
  /** The saved (or seeded) text this draft was typed on top of. */
  base: string;
  /** When it was written, for a human reading localStorage. Not used for decisions. */
  at: number;
}

/** The slice of `localStorage` this needs, so tests can supply a hostile one. */
export interface DraftStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function resolve(explicit?: DraftStore): DraftStore | null {
  if (explicit) return explicit;
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage ?? null;
  } catch {
    // Reading the property itself throws when site data is blocked.
    return null;
  }
}

export function draftKey(sketchId: number | null): string {
  return sketchId === null ? NEW_DRAFT_KEY : `${PREFIX}${sketchId}`;
}

export function readDraft(sketchId: number | null, store?: DraftStore): Draft | null {
  const target = resolve(store);
  if (!target) return null;
  try {
    const raw = target.getItem(draftKey(sketchId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Draft>;
    // A draft with no code is not a draft. Anything shaped wrong is treated as
    // absent rather than repaired: a half-understood draft is worse than none.
    if (typeof parsed.code !== 'string' || typeof parsed.name !== 'string') return null;
    return {
      name: parsed.name,
      code: parsed.code,
      base: typeof parsed.base === 'string' ? parsed.base : '',
      at: typeof parsed.at === 'number' ? parsed.at : 0,
    };
  } catch {
    return null;
  }
}

export function writeDraft(
  sketchId: number | null,
  draft: { name: string; code: string; base: string },
  store?: DraftStore,
): void {
  const target = resolve(store);
  if (!target) return;
  try {
    target.setItem(draftKey(sketchId), JSON.stringify({ ...draft, at: Date.now() }));
  } catch {
    /* over quota or blocked: the buffer is still on screen, which is today's behaviour */
  }
}

export function clearDraft(sketchId: number | null, store?: DraftStore): void {
  const target = resolve(store);
  if (!target) return;
  try {
    target.removeItem(draftKey(sketchId));
  } catch {
    /* nothing to do about it, and nothing depends on it having worked */
  }
}

/**
 * What to do with a draft found on disk.
 *
 * - `none`     nothing worth restoring; the draft says what the saved text says.
 * - `restored` a clean continuation: the draft was typed on the text still saved.
 * - `diverged` the draft is real, but the saved sketch has moved on since. The
 *              buffer is restored anyway, because unsaved keystrokes are the thing
 *              at risk, and the caller must SAY SO so the discard is a choice.
 */
export type RestoreKind = 'none' | 'restored' | 'diverged';

export function draftRestore(
  draft: Draft | null,
  saved: { name: string; code: string },
): { kind: RestoreKind; draft: Draft | null } {
  if (!draft) return { kind: 'none', draft: null };
  if (draft.code === saved.code && draft.name === saved.name) return { kind: 'none', draft: null };
  return { kind: draft.base === saved.code ? 'restored' : 'diverged', draft };
}
