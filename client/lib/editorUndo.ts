/**
 * Undo that reaches the editor from outside the editor.
 *
 * Painting a pixel rewrites a character in the sketch's source, so it is an
 * ordinary edit and belongs in the ordinary undo history. It already was: the
 * paint dispatches through CodeMirror, and focusing the editor and pressing
 * Ctrl+Z reverted it. The problem was purely where the keystroke landed. The
 * canvas is not focusable, so after a click `document.activeElement` is the
 * BODY, and CodeMirror's history keymap is bound to the editor's own DOM: the
 * chord went nowhere and the paint looked un-undoable.
 *
 * The fix forwards the chord rather than reimplementing the command. Pushing the
 * real event through `runScopeHandlers` runs whatever the editor's own keymap has
 * registered, which means undo executes against exactly the history instance
 * `basicSetup` installed. Calling `undo()` from `@codemirror/commands` directly
 * would mean a second reference to that package, and if the tree ever served two
 * copies the history field identity would differ and undo would silently do
 * nothing. It would also drift the moment the editor's keymap changed.
 *
 * Only undo and redo are forwarded. Forwarding everything would make the canvas
 * a second text input.
 */

import { runScopeHandlers, type EditorView } from '@codemirror/view';

export type UndoChord = 'undo' | 'redo' | null;

/**
 * Which history command a keydown asks for, if any.
 *
 * Shift is part of the redo chord, so it must not be treated as "no modifier".
 * Alt is excluded: `Ctrl+Alt+Z` and friends belong to the OS and the browser,
 * and claiming them would take a chord we were never offered.
 */
export function undoChord(e: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): UndoChord {
  if (e.altKey) return null;
  if (!e.ctrlKey && !e.metaKey) return null;

  // Shift reports the capital, so compare case-insensitively.
  const key = e.key.toLowerCase();
  if (key === 'z') return e.shiftKey ? 'redo' : 'undo';
  if (key === 'y') return 'redo';
  return null;
}

/**
 * Hand the event to the editor's own keymap.
 *
 * Returns whether a handler claimed it, so the caller knows whether to
 * `preventDefault`. `'editor'` is the scope CodeMirror's default keymaps
 * register under.
 */
export function forwardToEditor(view: EditorView | null, e: KeyboardEvent): boolean {
  if (!view) return false;
  return runScopeHandlers(view, e, 'editor');
}
