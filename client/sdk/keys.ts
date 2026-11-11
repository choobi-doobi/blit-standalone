/**
 * Keyboard-shortcut guards (`@client/sdk/keys`).
 *
 * Promoted from `plugin-src/forge/client/lib/keys.ts` — the only copy that is
 * both unit-tested and handles the open-overlay case — merged with `primer`'s
 * `isModalOpen()`, which also matches `[aria-modal="true"]`.
 *
 * ~25 inline copies exist across 12 plugins in three tiers: roughly half omit
 * `SELECT`, and only forge and primer check for an open overlay — so ~10
 * plugins currently fire canvas/navigation shortcuts while a modal has focus.
 * Migrating to this module fixes that at zero marginal cost.
 *
 * **Standardised on `e.target`, with `document.activeElement` as a fallback**
 * for events dispatched at `window`/`document` (where `target` is not an
 * element). Copies disagreed on which to read; they only differ when focus and
 * the event target differ, and the target is the more specific answer.
 *
 * Usage:
 *   window.addEventListener('keydown', (e) => {
 *     if (shouldIgnoreKey(e)) return;
 *     …
 *   });
 */

/** Roles/wrappers that own their own keyboard handling while they are open. */
const OVERLAY_SELECTOR =
  '[role="dialog"],[role="menu"],[role="listbox"],[data-radix-popper-content-wrapper]';

/** Overlays that are open ANYWHERE in the document, regardless of where focus sits. */
const OPEN_OVERLAY_SELECTOR = '[role="dialog"][data-state="open"],[aria-modal="true"]';

function asElement(target: EventTarget | null | undefined): HTMLElement | null {
  if (!target || typeof target !== 'object') return null;
  const el = target as Partial<HTMLElement> & EventTarget;
  return typeof el.tagName === 'string' ? (el as HTMLElement) : null;
}

/**
 * True when `target` is a text-entry surface: `INPUT`, `TEXTAREA`, `SELECT`, or
 * anything `contentEditable`. Also true when it sits inside a dialog, menu,
 * listbox or Radix popper, which own their own keyboard handling.
 *
 * Falls back to `document.activeElement` when `target` is not an element (a
 * `keydown` listener bound to `window` sees `window` as the target in some
 * synthetic-event paths).
 */
export function isTypingTarget(target: EventTarget | null | undefined): boolean {
  const el =
    asElement(target) ??
    (typeof document !== 'undefined' ? asElement(document.activeElement) : null);
  if (!el) return false;

  const tag = el.tagName.toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  if (typeof el.closest === 'function' && el.closest(OVERLAY_SELECTOR)) return true;
  return false;
}

/** True when any modal dialog is open anywhere in the document. */
export function isOverlayOpen(): boolean {
  if (typeof document === 'undefined') return false;
  return !!document.querySelector(OPEN_OVERLAY_SELECTOR);
}

/** The guard every window-level `keydown` handler should open with. */
export function shouldIgnoreKey(e: KeyboardEvent): boolean {
  return isTypingTarget(e.target) || isOverlayOpen();
}

/** True when any of Ctrl / Meta / Alt is held. Shift alone does not count. */
export function hasModifier(e: KeyboardEvent | { ctrlKey: boolean; metaKey: boolean; altKey: boolean }): boolean {
  return e.ctrlKey || e.metaKey || e.altKey;
}

// ── Displaying a binding ─────────────────────────────────────────────────────
//
// Four plugins wrote a cheat sheet and three wrote this detection separately;
// commander's simply hardcoded `Ctrl`, so every Mac user read the wrong glyph.
// It lives here rather than beside the overlay component because a plugin's
// shortcut TABLE is a plain data module — it must be able to name the glyphs
// without importing React.

/**
 * True on macOS. **Display only** — matching a keystroke should test
 * `e.metaKey || e.ctrlKey`, never this, because a Mac user on an external PC
 * keyboard still sends the key their hardware has.
 */
export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent || '');
}

/** This platform's Ctrl-equivalent glyph. */
export const MOD = isMacPlatform() ? '⌘' : 'Ctrl';
/** This platform's Alt glyph. */
export const ALT = isMacPlatform() ? '⌥' : 'Alt';
/** This platform's Shift glyph. */
export const SHIFT = isMacPlatform() ? '⇧' : 'Shift';

/**
 * Render the platform-neutral tokens `Mod`, `Alt` and `Shift` in a display
 * string as this platform's glyphs: `formatKeys('Mod+Z')` → `⌘+Z` or `Ctrl+Z`.
 *
 * Word-bounded, so a label reading "Modifier" or "Shifter" survives intact —
 * a naive replace turns the first into "⌘ifier".
 */
export function formatKeys(keys: string, mac = isMacPlatform()): string {
  return keys
    .replace(/\bMod\b/g, mac ? '⌘' : 'Ctrl')
    .replace(/\bAlt\b/g, mac ? '⌥' : 'Alt')
    .replace(/\bShift\b/g, mac ? '⇧' : 'Shift');
}
