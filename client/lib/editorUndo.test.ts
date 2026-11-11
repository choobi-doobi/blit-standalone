/**
 * Undo has to reach the editor from outside the editor.
 *
 * Painting happens on the canvas, which is not focusable, so after a click
 * `document.activeElement` is the BODY. CodeMirror's history keymap is bound to
 * the editor's own DOM, so Ctrl+Z pressed after a paint went nowhere: the paint
 * WAS in the history (focusing the editor and pressing Ctrl+Z reverted it), the
 * keystroke just never arrived. These are the chord rules for the window-level
 * handler that forwards it.
 */
import { describe, it, expect } from 'vitest';
import { undoChord } from './editorUndo';

/** A keydown just real enough for the predicate. */
function key(init: Partial<KeyboardEvent> & { key: string }): KeyboardEvent {
  return {
    key: init.key,
    ctrlKey: init.ctrlKey ?? false,
    metaKey: init.metaKey ?? false,
    shiftKey: init.shiftKey ?? false,
    altKey: init.altKey ?? false,
  } as KeyboardEvent;
}

describe('undoChord', () => {
  it('recognises undo on both platforms', () => {
    expect(undoChord(key({ key: 'z', ctrlKey: true }))).toBe('undo');
    expect(undoChord(key({ key: 'z', metaKey: true }))).toBe('undo');
  });

  it('recognises redo in all three spellings', () => {
    // Ctrl/Cmd+Shift+Z is the common one...
    expect(undoChord(key({ key: 'z', ctrlKey: true, shiftKey: true }))).toBe('redo');
    expect(undoChord(key({ key: 'Z', ctrlKey: true, shiftKey: true }))).toBe('redo');
    expect(undoChord(key({ key: 'z', metaKey: true, shiftKey: true }))).toBe('redo');
    // ...and Ctrl+Y is what a Windows user reaches for.
    expect(undoChord(key({ key: 'y', ctrlKey: true }))).toBe('redo');
  });

  it('is case insensitive, because Shift changes the reported key', () => {
    expect(undoChord(key({ key: 'Z', ctrlKey: true }))).toBe('undo');
    expect(undoChord(key({ key: 'Y', ctrlKey: true }))).toBe('redo');
  });

  it('ignores the bare letter, so typing z on the canvas is not an undo', () => {
    expect(undoChord(key({ key: 'z' }))).toBe(null);
    expect(undoChord(key({ key: 'y' }))).toBe(null);
  });

  it('ignores Alt-modified chords, which belong to the OS and the browser', () => {
    expect(undoChord(key({ key: 'z', ctrlKey: true, altKey: true }))).toBe(null);
    expect(undoChord(key({ key: 'y', metaKey: true, altKey: true }))).toBe(null);
  });

  it('leaves every other chord alone', () => {
    // Notably Mod+Enter, which is Blit's own run binding, and Mod+K, which is
    // the host's command palette.
    expect(undoChord(key({ key: 'Enter', ctrlKey: true }))).toBe(null);
    expect(undoChord(key({ key: 'k', metaKey: true }))).toBe(null);
    expect(undoChord(key({ key: 's', ctrlKey: true }))).toBe(null);
    expect(undoChord(key({ key: 'Escape' }))).toBe(null);
  });

  it('does not treat Cmd+Y on a Mac as undo by accident', () => {
    // Redo, not undo: the distinction is the whole point of the return value.
    expect(undoChord(key({ key: 'y', metaKey: true }))).toBe('redo');
  });
});
