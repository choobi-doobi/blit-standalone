/**
 * Blit's Fluent 2 brand, declared once.
 *
 * Blit's chrome is the real `@fluentui/react-components` v9 design system, themed
 * to Blit's own violet/magenta identity rather than Fluent's default blue. The
 * whole subtree is wrapped in a `<FluentProvider>` (see `pages/BlitPage.tsx`)
 * whose theme is one of the two built here, so every Fluent component and every
 * `tokens.*` reference resolves against these values and nothing else.
 *
 * This lives in `lib/` on purpose: a `BrandVariants` ramp is sixteen colour
 * literals, and colour is Blit's DATA, not chrome — the same reason the engine's
 * palettes live here. The chrome colour lint scopes itself to `components/`,
 * `pages/` and `styles.css` precisely so a ramp of brand hexes is not mistaken
 * for a hard-coded surface colour. `lib/blitIdentity.test.ts` holds that
 * boundary: the ramp is declared once, here, and nowhere else spells a Fluent hex.
 *
 * The ramp is seeded from violet `#7C5CFF` at slot 80 (Fluent's primary slot),
 * darkening to a near-black violet at 10 and lightening through magenta-tinted
 * lavenders to 160. `createLightTheme` / `createDarkTheme` derive the full token
 * set — brand backgrounds, strokes, compound foregrounds, selection fills — from
 * it, so the whole chrome moves together when the host theme flips.
 */
import {
  createDarkTheme,
  createLightTheme,
  type BrandVariants,
  type Theme,
} from '@fluentui/react-components';

import type { HostTheme } from '../hooks/useIsMobile';

/** Violet → magenta. Slot 80 is the seed; 10 is the darkest shade, 160 the lightest tint. */
export const blitBrand: BrandVariants = {
  10: '#0C0727',
  20: '#10073B',
  30: '#140755',
  40: '#1A0576',
  50: '#1E029C',
  60: '#2900CC',
  70: '#3B0AFF',
  80: '#7C5CFF',
  90: '#A680FF',
  100: '#C29BFD',
  110: '#D6B0FD',
  120: '#E3C0FC',
  130: '#ECD0FB',
  140: '#F3DFFB',
  150: '#F7EAFB',
  160: '#FAF3FC',
};

export const blitLightTheme: Theme = createLightTheme(blitBrand);
export const blitDarkTheme: Theme = createDarkTheme(blitBrand);

/**
 * The Fluent theme to pair with the host theme signal (`<html data-theme>`).
 *
 * Light gets the light theme; dark and OLED share the dark one — Fluent's dark
 * ramp reads correctly on a black surface, and Blit does not store a theme of its
 * own. Default dark, which is what an unknown or missing signal resolves to.
 */
export function fluentThemeFor(theme: HostTheme): Theme {
  return theme === 'light' ? blitLightTheme : blitDarkTheme;
}
