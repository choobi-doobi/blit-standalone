/**
 * How the canvas and the editor are arranged inside the workbench card, and how
 * much of it each one gets.
 *
 * Two facts, both remembered: the ARRANGEMENT (stacked, or side by side) and the
 * SHARE the canvas takes of it. The share is a fraction rather than a pixel
 * count, which is the one decision here worth stating: the card is a flex child
 * of a window that resizes, and a remembered pixel height would mean a canvas
 * that keeps its 300px while the editor absorbs every window resize on its own.
 *
 * Each arrangement keeps its OWN share, because they are not the same question.
 * Stacked, the editor wants most of the height and the canvas sits above it; side
 * by side, an even split is the usual answer. Storing one number for both would
 * make switching arrangement also undo the sizing you had just done.
 *
 * Every read and write is guarded the way `panelState` is: `localStorage` throws
 * in a private window, and a layout that cannot remember itself is not a reason
 * for the editor to fail to mount.
 */

import { useCallback, useEffect, useState } from 'react';

/** `stacked` is the canvas above the editor; `columns` is the two side by side. */
export type WorkbenchLayout = 'stacked' | 'columns';

export const LAYOUTS: readonly WorkbenchLayout[] = Object.freeze(['stacked', 'columns']);

/** Neither pane may be squeezed to nothing: below this it is a sliver, not a pane. */
export const MIN_SHARE = 0.15;
export const MAX_SHARE = 0.85;

/**
 * Stacked defaults to 0.4 because that is the 2:3 the card had before it was
 * adjustable, so nobody who never touches the handle sees anything move.
 */
export const DEFAULT_SHARES: Readonly<Record<WorkbenchLayout, number>> = Object.freeze({
  stacked: 0.4,
  columns: 0.5,
});

const KEY = 'blit.workbench';

export function isLayout(value: unknown): value is WorkbenchLayout {
  return value === 'stacked' || value === 'columns';
}

/** Clamp a share into the usable range, at a thousandth: a drag stores no more. */
export function clampShare(share: number): number {
  if (!Number.isFinite(share)) return DEFAULT_SHARES.stacked;
  return Math.round(Math.min(MAX_SHARE, Math.max(MIN_SHARE, share)) * 1000) / 1000;
}

interface Stored {
  layout: WorkbenchLayout;
  shares: Record<WorkbenchLayout, number>;
}

function fresh(): Stored {
  return { layout: 'stacked', shares: { ...DEFAULT_SHARES } };
}

export function readWorkbench(raw: string | null): Stored {
  if (!raw) return fresh();
  try {
    const parsed = JSON.parse(raw) as Partial<Stored>;
    const shares: Partial<Record<WorkbenchLayout, number>> = parsed.shares ?? {};
    return {
      layout: isLayout(parsed.layout) ? parsed.layout : 'stacked',
      shares: {
        stacked: clampShare(typeof shares.stacked === 'number' ? shares.stacked : DEFAULT_SHARES.stacked),
        columns: clampShare(typeof shares.columns === 'number' ? shares.columns : DEFAULT_SHARES.columns),
      },
    };
  } catch {
    return fresh();
  }
}

export interface Workbench {
  layout: WorkbenchLayout;
  /** The canvas's share of the card. The editor gets the rest. */
  share: number;
  setLayout: (layout: WorkbenchLayout) => void;
  setShare: (share: number) => void;
  /** Back to this arrangement's default, which is what a double-click means. */
  reset: () => void;
}

export function useWorkbench(): Workbench {
  const [state, setState] = useState<Stored>(() => {
    if (typeof window === 'undefined') return fresh();
    try {
      return readWorkbench(window.localStorage.getItem(KEY));
    } catch {
      return fresh();
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* a workbench that cannot remember its split is not worth an error */
    }
  }, [state]);

  const setLayout = useCallback((layout: WorkbenchLayout) => {
    setState((prev) => (prev.layout === layout ? prev : { ...prev, layout }));
  }, []);

  const setShare = useCallback((share: number) => {
    setState((prev) => ({ ...prev, shares: { ...prev.shares, [prev.layout]: clampShare(share) } }));
  }, []);

  const reset = useCallback(() => {
    setState((prev) => ({ ...prev, shares: { ...prev.shares, [prev.layout]: DEFAULT_SHARES[prev.layout] } }));
  }, []);

  return { layout: state.layout, share: state.shares[state.layout], setLayout, setShare, reset };
}
