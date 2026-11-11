/**
 * Page-level chords that are not the editor's.
 *
 * `undoChord` lives in `editorUndo.ts` because it is forwarded INTO CodeMirror;
 * this one is Blit's own command, so it lives apart from that machinery.
 */

/**
 * Whether a keydown is the save chord.
 *
 * `Ctrl`/`Cmd` + `S` and nothing else. Shift is excluded because
 * `Ctrl`/`Cmd` + `Shift` + `S` is "Save As" everywhere it exists, and Blit has
 * no second save to offer: claiming it would swallow a chord the user meant for
 * the browser. Alt is excluded for the same reason as in `undoChord` — those
 * belong to the OS.
 *
 * Deliberately says nothing about WHERE the event came from. Save is the one
 * chord that has to fire while a text field has focus: pressing it after typing
 * a sketch name is exactly when someone means it most. The caller therefore
 * checks this BEFORE `shouldIgnoreKey`, which is why this predicate stays free
 * of any notion of the focused element.
 */
export function isSaveChord(e: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): boolean {
  if (e.altKey || e.shiftKey) return false;
  if (!e.ctrlKey && !e.metaKey) return false;
  return e.key.toLowerCase() === 's';
}

/** A chord with no modifier held at all: a bare key press. */
function bare(e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }): boolean {
  return !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey;
}

/**
 * Space: play/pause, the way every player on the machine does it.
 *
 * Bare Space only. `Ctrl`+Space and friends belong to input methods and to the
 * OS, and Shift+Space is page-up in enough places to be worth leaving alone.
 */
export function isPlayPauseChord(e: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): boolean {
  // Browsers disagree about the name: `' '` is the spec, `'Spacebar'` was IE and
  // is still what some embedded webviews send.
  return bare(e) && (e.key === ' ' || e.key === 'Spacebar');
}

/** `.` steps a frame forward, `,` steps back. The pair video editors use. */
export function isStepForwardChord(e: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): boolean {
  return bare(e) && e.key === '.';
}

export function isStepBackChord(e: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): boolean {
  return bare(e) && e.key === ',';
}

/**
 * Would Space already do something where the focus is?
 *
 * The case this exists for, established by removing it and watching what breaks:
 * focus is on a command button — Step, Reset, Run, Save — and Space is pressed.
 * Space activates a focused button, so that keystroke means "press this". Without
 * this check the page claims it first, calls `preventDefault` (which cancels the
 * button's activation), and toggles playback instead. The button you were on
 * silently does nothing.
 *
 * Two things it is NOT for, both measured rather than assumed:
 *
 * - It is not what stops Space double-toggling when the Play button has focus.
 *   `preventDefault` on the keydown already cancels the button's own activation,
 *   so that fires once either way.
 * - It is not what protects a focused switch or text field. `shouldIgnoreKey`
 *   already filters those out before this is reached. The form-element branch
 *   below is therefore belt-and-braces, kept so the predicate is true on its own
 *   terms rather than only true in this one caller.
 *
 * Only Space needs any of this. `.` and `,` activate nothing.
 */
export function wouldActivateFocused(target: EventTarget | null): boolean {
  if (!target || typeof (target as { tagName?: unknown }).tagName !== 'string') return false;
  const el = target as unknown as { tagName: string; getAttribute(name: string): string | null };
  const tag = el.tagName.toUpperCase();
  if (tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY' || tag === 'OPTION') return true;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return true;
  const role = el.getAttribute('role');
  return role === 'button' || role === 'checkbox' || role === 'switch' || role === 'slider' || role === 'link';
}
