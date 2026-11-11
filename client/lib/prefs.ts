/**
 * App-wide preferences, kept in localStorage and shared by every component that
 * reads them through `usePrefs`. The theme is applied to `<html data-theme>`.
 */

import { useSyncExternalStore } from 'react';

export type ThemeChoice = 'system' | 'light' | 'dark';

export interface Prefs {
  theme: ThemeChoice;
  /** Re-run the sketch shortly after typing stops. */
  live: boolean;
  liveDelay: number;
  fontSize: number;
  tabSize: number;
  lineWrap: boolean;
  onion: boolean;
  checker: boolean;
  newW: number;
  newH: number;
  newFps: number;
}

export const DEFAULT_PREFS: Prefs = {
  theme: 'system',
  live: true,
  liveDelay: 300,
  fontSize: 13,
  tabSize: 2,
  lineWrap: true,
  onion: false,
  checker: true,
  newW: 16,
  newH: 16,
  newFps: 12,
};

const KEY = 'blit.prefs';
const listeners = new Set<() => void>();

function load(): Prefs {
  let stored: Partial<Prefs> = {};
  try {
    stored = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Prefs>;
    // The old theme key, so a choice made before prefs existed still holds.
    const legacy = localStorage.getItem('blit.theme');
    if (!stored.theme && (legacy === 'light' || legacy === 'dark')) stored.theme = legacy;
  } catch {
    /* storage unavailable: defaults */
  }
  return { ...DEFAULT_PREFS, ...stored };
}

let current = load();

export function getPrefs(): Prefs {
  return current;
}

export function setPrefs(patch: Partial<Prefs>): void {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* kept for this tab only */
  }
  if (patch.theme) applyTheme();
  listeners.forEach((l) => l());
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getPrefs,
  );
}

const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: light)') : null;

export function applyTheme(): void {
  const choice = current.theme;
  const theme = choice === 'system' ? (media?.matches ? 'light' : 'dark') : choice;
  document.documentElement.setAttribute('data-theme', theme);
}

/** Apply the theme now, honour `?theme=`, and follow the OS while on "system". */
export function syncTheme(): void {
  const param = new URLSearchParams(window.location.search).get('theme');
  if (param === 'light' || param === 'dark') current = { ...current, theme: param };
  applyTheme();
  media?.addEventListener('change', applyTheme);
}
