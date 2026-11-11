/**
 * Every gallery example must evaluate, render and stay warning-free.
 *
 * Examples are the documentation, and a broken one is worse than a missing one:
 * it teaches a call that no longer exists. A rename in the algebra fails here.
 */

import { describe, expect, it } from 'vitest';

import { SILENCE, toAudioFrame } from './blit/audio';
import { evaluateSketch } from './blit/evaluate';
import { makeCtx, renderToRgba } from './blit/render';
import { EXAMPLES, findExample, STARTER } from './examples';

describe('examples', () => {
  it('has a unique id and a stated lesson for each', () => {
    const ids = EXAMPLES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const example of EXAMPLES) {
      expect(example.name.length, example.id).toBeGreaterThan(0);
      expect(example.teaches.length, example.id).toBeGreaterThan(0);
    }
  });

  it('opens on one of its own examples', () => {
    expect(findExample(STARTER.id)).toBe(STARTER);
  });

  it.each(EXAMPLES.map((e) => [e.id, e] as const))('%s evaluates without error', (_id, example) => {
    expect(() => evaluateSketch(example.code)).not.toThrow();
  });

  it.each(EXAMPLES.map((e) => [e.id, e] as const))('%s maps every character it uses', (_id, example) => {
    // An unmapped character draws nothing, which in an example reads as a bug in
    // the language rather than a typo in the sketch.
    expect(evaluateSketch(example.code).warnings).toEqual([]);
  });

  it.each(EXAMPLES.map((e) => [e.id, e] as const))('%s draws something visible', (_id, example) => {
    const sketch = evaluateSketch(example.code);
    const { w, h, fps, cycle, ramp } = sketch.settings;
    const data = renderToRgba(sketch.pattern, { w, h, frame: 0, fps, cycle, ramp });
    let visible = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) visible += 1;
    // A blank canvas is a broken example, and this assertion has to be able to
    // notice: the negative control is the empty sketch below.
    expect(visible, `${example.id} rendered nothing`).toBeGreaterThan(0);
  });

  it('would notice a blank example, so the visibility check is not vacuous', () => {
    const sketch = evaluateSketch('size(8, 8); out(empty())');
    const data = renderToRgba(sketch.pattern, { w: 8, h: 8, frame: 0, fps: 12, cycle: 8 });
    let visible = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) visible += 1;
    expect(visible).toBe(0);
  });

  it.each(EXAMPLES.map((e) => [e.id, e] as const))('%s still renders a whole cycle in', (_id, example) => {
    // An animation that throws on frame 5 is a crash the user meets seconds after
    // loading, so walk the whole loop rather than trusting frame 0.
    const sketch = evaluateSketch(example.code);
    const { w, h, fps, cycle, ramp } = sketch.settings;
    for (let frame = 0; frame < cycle; frame += 1) {
      expect(() => renderToRgba(sketch.pattern, { w, h, frame, fps, cycle, ramp })).not.toThrow();
    }
  }, 30_000); // a 512x512 loop of 192 frames takes several seconds, every frame of it is still walked
});

/**
 * The headline backward-compatibility property, and the reason `Ctx` may carry
 * music at all.
 *
 * Every sketch anybody has ever saved was written before `ctx.audio` existed.
 * None of them names it, and none of them may notice that it arrived: the
 * spritesheet, the PNG export and every test render must produce the same bytes
 * they produced yesterday. The gallery is the corpus this can be proved against,
 * because it is the one set of real sketches that lives in the repository.
 *
 * Three parts, and all three are needed:
 *
 *  1. the default is SILENCE, shared and frozen, and silent in every field;
 *  2. no example can tell the difference between silence and a loud frame;
 *  3. a `live()` sketch CAN tell the difference, which is what proves (2) is
 *     measuring something rather than comparing a picture with itself.
 */
describe('a stored sketch cannot observe that ctx.audio arrived', () => {
  const LOUD = toAudioFrame({
    fft: [0.9, 0.8, 0.7, 0.6],
    vol: 60,
    beat: true,
    sinceBeat: 0,
    cycle: 4.5,
    cps: 0.75,
    playing: true,
    haps: [
      { s: 'bd', note: 36, gain: 1, begin: 4, end: 4.25 },
      { s: 'hh', note: null, gain: 0.4, begin: 4.25, end: 4.3 },
      { s: 'sd', note: 38, gain: 0.8, begin: 4.5, end: 4.75 },
    ],
  });

  /** A live sketch that is a pure function of the music, and of nothing else. */
  const REACTIVE = 'size(8, 8);\nout(live((a) => solid(grey(a.bass * 255))));';

  it('defaults to the shared frozen SILENCE, so a render that names no music is reproducible', () => {
    const ctx = makeCtx({ w: 4, h: 4, frame: 0, fps: 12, cycle: 8 });
    expect(ctx.audio).toBe(SILENCE);
    expect(Object.isFrozen(ctx.audio)).toBe(true);
    expect(Object.isFrozen(ctx.audio.fft)).toBe(true);
    // Silent in every field. A signal defaulting to anything else would change
    // what every stored sketch renders the moment one of them reads it.
    expect(ctx.audio.fft.every((v) => v === 0)).toBe(true);
    expect([ctx.audio.vol, ctx.audio.bass, ctx.audio.mid, ctx.audio.treble]).toEqual([0, 0, 0, 0]);
    expect([ctx.audio.beat, ctx.audio.playing]).toEqual([false, false]);
    expect([ctx.audio.cycle, ctx.audio.cps, ctx.audio.sinceBeat]).toEqual([0, 0, Infinity]);
    expect(ctx.audio.haps).toEqual([]);
  });

  it.each(EXAMPLES.map((e) => [e.id, e] as const))(
    '%s renders byte for byte the same under silence and under a loud frame',
    (_id, example) => {
      const sketch = evaluateSketch(example.code);
      const { w, h, fps, cycle, ramp } = sketch.settings;
      // Big film-length sketches are sampled; small ones check every frame.
      const step = w * h * cycle > 64 * 64 * 64 ? 16 : 1;
      for (let frame = 0; frame < cycle; frame += step) {
        const silent = renderToRgba(sketch.pattern, { w, h, frame, fps, cycle, ramp });
        const loud = renderToRgba(sketch.pattern, { w, h, frame, fps, cycle, ramp, audio: LOUD });
        expect([...loud], `${example.id} frame ${frame}`).toEqual([...silent]);
      }
    },
  );

  it('would notice: a live() sketch renders differently under the same two frames', () => {
    // The negative control. Without it the equality above would pass just as
    // well if `audio` never reached a pattern at all.
    const sketch = evaluateSketch(REACTIVE);
    const o = { w: 8, h: 8, frame: 0, fps: 12, cycle: 8 };
    const silent = [...renderToRgba(sketch.pattern, o)];
    const loud = [...renderToRgba(sketch.pattern, { ...o, audio: LOUD })];
    expect(loud).not.toEqual(silent);
  });

  it('draws a determinate picture under silence, which is the reproducibility claim itself', () => {
    const sketch = evaluateSketch(REACTIVE);
    const data = renderToRgba(sketch.pattern, { w: 8, h: 8, frame: 0, fps: 12, cycle: 8 });
    // Opaque black: `bass` is 0 under silence, so this is the same picture on
    // every machine, in the export, and in a year.
    expect([...data.slice(0, 4)]).toEqual([0, 0, 0, 255]);
    expect([...data].every((v, i) => (i % 4 === 3 ? v === 255 : v === 0))).toBe(true);
  });
});
