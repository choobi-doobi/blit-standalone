/**
 * The save chord has to fire from anywhere on the page, including out of a text
 * field, so the predicate is deliberately ignorant of focus. What it must get
 * right is the modifier set: `Ctrl`/`Cmd` + `Shift` + `S` is Save As in every
 * browser, and taking it would swallow a chord meant for them.
 */
import { describe, expect, it } from 'vitest';

import {
  isPlayPauseChord,
  isSaveChord,
  isStepBackChord,
  isStepForwardChord,
  wouldActivateFocused,
} from './chords';

function key(init: Partial<KeyboardEvent> & { key: string }): KeyboardEvent {
  return {
    key: init.key,
    ctrlKey: init.ctrlKey ?? false,
    metaKey: init.metaKey ?? false,
    shiftKey: init.shiftKey ?? false,
    altKey: init.altKey ?? false,
  } as KeyboardEvent;
}

describe('isSaveChord', () => {
  it('recognises the chord on both platforms', () => {
    expect(isSaveChord(key({ key: 's', ctrlKey: true }))).toBe(true);
    expect(isSaveChord(key({ key: 's', metaKey: true }))).toBe(true);
  });

  it('is case insensitive, since a held Shift is not the only way to get S', () => {
    expect(isSaveChord(key({ key: 'S', ctrlKey: true }))).toBe(true);
  });

  it('leaves Save As alone', () => {
    expect(isSaveChord(key({ key: 'S', ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(isSaveChord(key({ key: 's', metaKey: true, shiftKey: true }))).toBe(false);
  });

  it('ignores Alt-modified chords, which belong to the OS', () => {
    expect(isSaveChord(key({ key: 's', ctrlKey: true, altKey: true }))).toBe(false);
  });

  it('ignores the bare letter, so typing s is not a save', () => {
    expect(isSaveChord(key({ key: 's' }))).toBe(false);
  });

  it('leaves every other chord alone, including the ones Blit already owns', () => {
    expect(isSaveChord(key({ key: 'Enter', ctrlKey: true }))).toBe(false);
    expect(isSaveChord(key({ key: 'z', ctrlKey: true }))).toBe(false);
    // The host's palette.
    expect(isSaveChord(key({ key: 'k', metaKey: true }))).toBe(false);
  });
});

const bareKey = (key: string) => ({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false });

describe('transport chords', () => {
  it('takes bare Space for play/pause, under either name browsers use for it', () => {
    expect(isPlayPauseChord(bareKey(' '))).toBe(true);
    expect(isPlayPauseChord(bareKey('Spacebar'))).toBe(true);
  });

  it('leaves a modified Space alone', () => {
    // Ctrl+Space belongs to input methods, Shift+Space is page-up in enough
    // places to be worth not claiming.
    for (const mod of ['ctrlKey', 'metaKey', 'shiftKey', 'altKey'] as const) {
      expect(isPlayPauseChord({ ...bareKey(' '), [mod]: true })).toBe(false);
    }
  });

  it('steps forward on `.` and back on `,`, and not the other way round', () => {
    expect(isStepForwardChord(bareKey('.'))).toBe(true);
    expect(isStepForwardChord(bareKey(','))).toBe(false);
    expect(isStepBackChord(bareKey(','))).toBe(true);
    expect(isStepBackChord(bareKey('.'))).toBe(false);
  });

  it('does not confuse the step keys with the save chord', () => {
    expect(isSaveChord(bareKey('.'))).toBe(false);
    expect(isPlayPauseChord({ ...bareKey('s'), ctrlKey: true })).toBe(false);
  });

  it('ignores a modified step key, since those are browser and OS chords', () => {
    expect(isStepForwardChord({ ...bareKey('.'), ctrlKey: true })).toBe(false);
    expect(isStepBackChord({ ...bareKey(','), metaKey: true })).toBe(false);
  });
});

describe('wouldActivateFocused', () => {
  const el = (tagName: string, role?: string) => ({
    tagName,
    getAttribute: (name: string) => (name === 'role' ? (role ?? null) : null),
  });

  it('is true for the controls Space already operates', () => {
    // The load-bearing case is a focused COMMAND button (Step, Reset, Run): Space
    // there means "press this", and a page shortcut that claimed it would cancel
    // the activation and do something else instead.
    expect(wouldActivateFocused(el('BUTTON'))).toBe(true);
    expect(wouldActivateFocused(el('button'))).toBe(true);
    expect(wouldActivateFocused(el('INPUT'))).toBe(true);
    expect(wouldActivateFocused(el('A'))).toBe(true);
    expect(wouldActivateFocused(el('DIV', 'button'))).toBe(true);
    expect(wouldActivateFocused(el('DIV', 'switch'))).toBe(true);
    expect(wouldActivateFocused(el('DIV', 'slider'))).toBe(true);
  });

  it('is false for the page itself and for anything inert', () => {
    expect(wouldActivateFocused(el('BODY'))).toBe(false);
    expect(wouldActivateFocused(el('DIV'))).toBe(false);
    expect(wouldActivateFocused(el('CANVAS'))).toBe(false);
    expect(wouldActivateFocused(null)).toBe(false);
    expect(wouldActivateFocused({} as EventTarget)).toBe(false);
  });
});
