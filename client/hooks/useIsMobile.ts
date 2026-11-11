/**
 * Blit's viewport and media-preference readers, built on `matchMedia`.
 *
 * SSR-safe: the initial state is computed without touching `window`.
 */

import { useEffect, useState } from 'react';

const SMALL_MAX = 767; // below Tailwind's `md`: the panels become a drawer
const TABLET_MAX = 1279; // below `xl`: the panels get tighter

export type BlitLayoutMode = 'desktop' | 'tablet' | 'small';

function hasWindow(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function';
}

function readMode(): BlitLayoutMode {
  if (!hasWindow()) return 'desktop';
  if (window.matchMedia(`(max-width: ${SMALL_MAX}px)`).matches) return 'small';
  if (window.matchMedia(`(max-width: ${TABLET_MAX}px)`).matches) return 'tablet';
  return 'desktop';
}

/**
 * The media query for "animate as little as you can get away with".
 *
 * Exported so the test pins the exact string. A typo here fails in the one
 * direction nobody notices: the query simply never matches, the preference is
 * ignored, and the canvas animates at anyone who asked it not to.
 */
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** Just enough of `MediaQueryList` to answer the question, so a test can fake it. */
type MediaMatcher = (query: string) => { matches: boolean };

/**
 * Whether the viewer has asked for reduced motion.
 *
 * Read once, at mount, to decide whether the canvas STARTS running. It is not a
 * hook and deliberately does not subscribe: the preference governs what happens
 * without being asked for, and once someone presses Play they have asked. A
 * subscription that paused a running sketch mid-session would be overriding an
 * explicit choice with an implicit one.
 *
 * Defaults to false when there is no `matchMedia` at all, which is the same
 * answer as "no preference set" and keeps the sketch running for everyone else.
 */
export function prefersReducedMotion(match?: MediaMatcher): boolean {
  const matcher = match ?? (hasWindow() ? (q: string) => window.matchMedia(q) : undefined);
  if (!matcher) return false;
  try {
    return matcher(REDUCED_MOTION_QUERY).matches;
  } catch {
    // An older browser can throw on an unknown feature rather than not matching.
    return false;
  }
}

export function useLayoutMode(): BlitLayoutMode {
  const [mode, setMode] = useState<BlitLayoutMode>(readMode);

  useEffect(() => {
    if (!hasWindow()) return;
    const small = window.matchMedia(`(max-width: ${SMALL_MAX}px)`);
    const tablet = window.matchMedia(`(max-width: ${TABLET_MAX}px)`);
    const onChange = (): void => setMode(readMode());
    onChange(); // the viewport may have changed between render and effect
    small.addEventListener('change', onChange);
    tablet.addEventListener('change', onChange);
    return () => {
      small.removeEventListener('change', onChange);
      tablet.removeEventListener('change', onChange);
    };
  }, []);

  return mode;
}

/** True when the host is in its light theme, so CodeMirror can follow it. */
export function useIsLightTheme(): boolean {
  const [light, setLight] = useState<boolean>(() =>
    typeof document === 'undefined' ? false : document.documentElement.dataset.theme === 'light',
  );

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const read = (): void => setLight(root.dataset.theme === 'light');
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  return light;
}

/**
 * The host's active theme, read off `<html data-theme>` and watched for changes.
 *
 * `client/main.tsx` writes `data-theme="dark|light"` on the root, following the
 * OS setting or a `?theme=` choice. Blit's `<FluentProvider>` keys its light/dark
 * theme off this attribute. Default dark.
 */
export type HostTheme = 'dark' | 'light' | 'oled';

function readHostTheme(): HostTheme {
  if (typeof document === 'undefined') return 'dark';
  const t = document.documentElement.getAttribute('data-theme');
  return t === 'light' || t === 'oled' ? t : 'dark';
}

export function useHostTheme(): HostTheme {
  const [theme, setTheme] = useState<HostTheme>(readHostTheme);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const read = (): void => setTheme(readHostTheme());
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  return theme;
}
