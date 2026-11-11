/**
 * Panel width and collapsed state, remembered per panel (DESIGN 8.8).
 *
 * Every read and write is guarded: `localStorage` throws in a private window and
 * comes back empty with site data cleared, and a panel that cannot remember its
 * width is not a reason for the editor to fail to mount.
 */

import { useCallback, useEffect, useState } from 'react';

export const MIN_PANEL = 220;
export const MAX_PANEL = 360;

interface PanelState {
  width: number;
  collapsed: boolean;
}

function read(key: string, fallbackWidth: number): PanelState {
  try {
    const raw = window.localStorage.getItem(`blit.panel.${key}`);
    if (!raw) return { width: fallbackWidth, collapsed: false };
    const parsed = JSON.parse(raw) as Partial<PanelState>;
    return {
      width: clampWidth(typeof parsed.width === 'number' ? parsed.width : fallbackWidth),
      collapsed: parsed.collapsed === true,
    };
  } catch {
    return { width: fallbackWidth, collapsed: false };
  }
}

export function clampWidth(width: number): number {
  if (!Number.isFinite(width)) return MIN_PANEL;
  return Math.min(MAX_PANEL, Math.max(MIN_PANEL, Math.round(width)));
}

export function usePanelState(
  key: string,
  fallbackWidth: number,
): {
  width: number;
  collapsed: boolean;
  setWidth: (width: number) => void;
  toggle: () => void;
} {
  const [state, setState] = useState<PanelState>(() =>
    typeof window === 'undefined' ? { width: fallbackWidth, collapsed: false } : read(key, fallbackWidth),
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(`blit.panel.${key}`, JSON.stringify(state));
    } catch {
      /* a panel that cannot remember its width is not worth an error */
    }
  }, [key, state]);

  const setWidth = useCallback((width: number) => {
    setState((prev) => ({ ...prev, width: clampWidth(width) }));
  }, []);

  const toggle = useCallback(() => {
    setState((prev) => ({ ...prev, collapsed: !prev.collapsed }));
  }, []);

  return { ...state, setWidth, toggle };
}
