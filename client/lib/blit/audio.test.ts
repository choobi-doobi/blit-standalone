/**
 * `toAudioFrame` is fed by another plugin's postMessage, so every test here is a
 * validation case rather than a happy path. The function must be TOTAL: there is
 * no input it may throw on, because a throw inside a render loop stops the
 * picture and the person watching has no way to learn why.
 */

import { describe, expect, it } from 'vitest';

import { SILENCE, toAudioFrame, type AudioFrame } from './audio';

const loud = {
  fft: [0.9, 0.8, 0.7, 0.6],
  vol: 60,
  beat: true,
  sinceBeat: 0,
  cycle: 12.5,
  cps: 0.75,
  playing: true,
  haps: [{ s: 'bd', note: 36, gain: 0.9, begin: 12, end: 12.25 }],
};

describe('SILENCE: the default every render that names no music gets', () => {
  it('is deep frozen, so one sketch cannot poison the next', () => {
    expect(Object.isFrozen(SILENCE)).toBe(true);
    expect(Object.isFrozen(SILENCE.fft)).toBe(true);
    expect(Object.isFrozen(SILENCE.haps)).toBe(true);
  });

  it('is silent in every field, which is what makes a render reproducible', () => {
    expect(SILENCE).toEqual({
      fft: [0, 0, 0, 0],
      vol: 0,
      bass: 0,
      mid: 0,
      treble: 0,
      beat: false,
      sinceBeat: Infinity,
      cycle: 0,
      cps: 0,
      playing: false,
      haps: [],
    });
  });

  it('throws on a write, rather than silently taking one', () => {
    // A sketch body is compiled in strict mode (errorSite.ts), so `a.vol = 1`
    // surfaces as an ordinary run-phase error instead of corrupting the shared
    // default for every other render in the tab.
    expect(() => {
      'use strict';
      (SILENCE as unknown as { vol: number }).vol = 1;
    }).toThrow(TypeError);
  });
});

describe('toAudioFrame is total: junk answers SILENCE', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'loud'],
    ['a number', 42],
    ['an array', [1, 2, 3]],
    ['a boolean', true],
  ])('answers the SILENCE singleton for %s', (_label, input) => {
    expect(toAudioFrame(input)).toBe(SILENCE);
  });

  it('answers a frame equal to SILENCE for an object carrying nothing usable', () => {
    // One rule, no exceptions: every field that is not usable falls back to
    // SILENCE's value for that field, INCLUDING `fft`. That is what makes the
    // headline claim ("junk answers silence") literally true rather than nearly.
    expect(toAudioFrame({})).toEqual(SILENCE);
    expect(toAudioFrame({ fft: 'loud', vol: 'loud', haps: 'loud' })).toEqual(SILENCE);
  });

  it('never throws, whatever it is handed', () => {
    const nasty: unknown[] = [
      { fft: [NaN, Infinity, '3', null], vol: NaN, haps: [null, 7, 'x'] },
      { get fft() { return [1]; }, vol: 1 },
      { haps: Array.from({ length: 1000 }, () => ({})) },
      Object.create(null),
    ];
    for (const input of nasty) expect(() => toAudioFrame(input)).not.toThrow();
  });
});

describe('toAudioFrame: the continuous half', () => {
  it('keeps finite bins and zeroes the rest', () => {
    expect(toAudioFrame({ fft: [0.5, NaN, Infinity, '3', null, 0.25] }).fft).toEqual([
      0.5, 0, 0, 0, 0, 0.25,
    ]);
  });

  it('derives the three bands from fft rather than trusting them', () => {
    // Derived on THIS side on purpose: if both plugins computed "bass" the two
    // could disagree about what the word means and neither would be wrong.
    const frame = toAudioFrame({ ...loud, bass: 99, mid: 99, treble: 99 });
    expect(frame.bass).toBeCloseTo(0.9);
    expect(frame.treble).toBeCloseTo(0.6);
    expect(frame.mid).toBeCloseTo((0.8 + 0.7) / 2);
  });

  it('falls back to the first bin for mid when there are fewer than three', () => {
    expect(toAudioFrame({ fft: [0.4] }).mid).toBeCloseTo(0.4);
    expect(toAudioFrame({ fft: [0.4, 0.2] }).mid).toBeCloseTo(0.4);
    expect(toAudioFrame({ fft: [] }).mid).toBe(0);
    expect(toAudioFrame({ fft: [] }).bass).toBe(0);
    expect(toAudioFrame({ fft: [] }).treble).toBe(0);
  });

  it('falls back to SILENCE for a non-finite scalar', () => {
    const frame = toAudioFrame({ vol: NaN, sinceBeat: 'soon', cycle: Infinity, cps: null });
    expect(frame.vol).toBe(0);
    expect(frame.sinceBeat).toBe(Infinity);
    expect(frame.cycle).toBe(0);
    expect(frame.cps).toBe(0);
  });

  it('reads the flags as identity, so the string "false" is not true', () => {
    expect(toAudioFrame({ beat: 'false', playing: 'false' }).beat).toBe(false);
    expect(toAudioFrame({ beat: 'false', playing: 'false' }).playing).toBe(false);
    expect(toAudioFrame({ beat: 1, playing: 1 }).beat).toBe(false);
    expect(toAudioFrame({ beat: true, playing: true }).playing).toBe(true);
  });
});

describe('toAudioFrame: the discrete half', () => {
  it('narrows a hap to exactly the five fields it promises', () => {
    const frame = toAudioFrame({
      haps: [{ s: 'bd', note: 36, gain: 0.5, begin: 2, end: 2.5, context: { secret: 1 } }],
    });
    expect(Object.keys(frame.haps[0]).sort()).toEqual(['begin', 'end', 'gain', 'note', 's']);
  });

  it('coerces each field and drops an entry that is not an object', () => {
    const frame = toAudioFrame({
      haps: [null, 7, 'x', { s: 9, note: 'high', gain: 'loud', begin: 'now' }],
    });
    expect(frame.haps).toEqual([{ s: '', note: null, gain: 1, begin: 0, end: 0 }]);
  });

  it('ends a hap at its own onset when the producer declares no end', () => {
    // The defence, not the normal case: the wire form DOES carry `end` (pane
    // protocol 2, `lib/strudelPaneProtocol.ts`). A producer that omits it is
    // malformed or predates the field, and the safe reading of a missing end is
    // an instantaneous event rather than an eternal one — a hap that never ends
    // would stay in every sketch's `haps` list for the rest of the set.
    expect(toAudioFrame({ haps: [{ s: 'hh', begin: 4 }] }).haps[0]).toEqual({
      s: 'hh',
      note: null,
      gain: 1,
      begin: 4,
      end: 4,
    });
  });

  it('caps the list, so a runaway pattern cannot make a render allocate without bound', () => {
    const many = Array.from({ length: 300 }, (_, i) => ({ s: 'x', begin: i }));
    const frame = toAudioFrame({ haps: many });
    expect(frame.haps).toHaveLength(256);
    expect(frame.haps[255].begin).toBe(255);
  });

  it('carries nothing callable, because this shape crosses a worker boundary', () => {
    const frame = toAudioFrame({ haps: [{ s: 'bd', begin: 0, hush: () => 1 }] });
    for (const value of Object.values(frame.haps[0])) expect(typeof value).not.toBe('function');
    expect(() => structuredClone(frame)).not.toThrow();
  });
});

describe('toAudioFrame: what comes back cannot be mutated', () => {
  it('freezes the frame, both arrays and every hap', () => {
    const frame: AudioFrame = toAudioFrame(loud);
    expect(Object.isFrozen(frame)).toBe(true);
    expect(Object.isFrozen(frame.fft)).toBe(true);
    expect(Object.isFrozen(frame.haps)).toBe(true);
    expect(Object.isFrozen(frame.haps[0])).toBe(true);
  });

  it('copies the arrays it was handed, so the producer cannot change them later', () => {
    const fft = [0.1, 0.2, 0.3, 0.4];
    const frame = toAudioFrame({ ...loud, fft });
    fft[0] = 0.99;
    expect(frame.fft[0]).toBeCloseTo(0.1);
  });
});
