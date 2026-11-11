import { describe, expect, it } from 'vitest';

import { parseColor, TRANSPARENT } from './color';
import { BlitError, evaluateSketch, type EvaluateOptions } from './evaluate';
import { probeAt, renderToRgba, type RenderOptions } from './render';
import type { BlitResolution, BlitSource } from './scene';

const R = parseColor('#e43b44');
const B = parseColor('#41a6f6');

/** A resolver over a fixed set of saved sketches, by name or id. */
function libraryOf(sources: BlitSource[], loading: string[] = []): EvaluateOptions['blits'] {
  return (ref): BlitResolution => {
    if (typeof ref === 'string' && loading.includes(ref)) return { kind: 'loading' };
    const found = sources.find((s) => (typeof ref === 'number' ? s.id === ref : s.name === ref));
    return found ? { kind: 'found', source: found } : { kind: 'error', message: `No saved sketch is called '${ref}'.` };
  };
}

const COIN: BlitSource = { id: 1, name: 'Coin', code: "size(2, 2); out(sprite(`rr\nrr`).pal({ r: '#e43b44' }))" };

function pixel(code: string, x: number, y: number, options: EvaluateOptions, frame = 0): number {
  const sketch = evaluateSketch(code, options);
  const { w, h, fps, cycle, ramp } = sketch.settings;
  const o: RenderOptions = { w, h, frame, fps, cycle, ramp };
  const data = renderToRgba(sketch.pattern, o);
  const i = (y * w + x) * 4;
  return ((data[i] << 24) | (data[i + 1] << 16) | (data[i + 2] << 8) | data[i + 3]) >>> 0;
}

describe('blit() places a saved sketch', () => {
  const blits = libraryOf([COIN]);

  it('draws it with its top-left corner at (x, y), and nothing around it', () => {
    const code = "size(8, 8); out(scene(blit('Coin', 3, 4)))";
    expect(pixel(code, 3, 4, { blits })).toBe(R);
    expect(pixel(code, 4, 5, { blits })).toBe(R);
    expect(pixel(code, 2, 4, { blits })).toBe(TRANSPARENT);
    expect(pixel(code, 5, 4, { blits })).toBe(TRANSPARENT);
  });

  it('places by id as well as by name', () => {
    expect(pixel("size(8, 8); out(blit(1, 6, 6))", 7, 7, { blits })).toBe(R);
  });

  it('defaults the position to the corner', () => {
    expect(pixel("size(8, 8); out(blit('Coin'))", 0, 0, { blits })).toBe(R);
  });

  it('runs the placed sketch in its own canvas, so it centres on its own size', () => {
    const dot: BlitSource = { id: 2, name: 'Dot', code: "size(5, 5); out(sprite(`r`).pal({ r: '#e43b44' }).center())" };
    const code = "size(32, 32); out(blit('Dot', 10, 10))";
    // Centred on its 5x5 at (2, 2), so at (12, 12) in the scene — not at (16, 16).
    expect(pixel(code, 12, 12, { blits: libraryOf([dot]) })).toBe(R);
    expect(pixel(code, 16, 16, { blits: libraryOf([dot]) })).toBe(TRANSPARENT);
  });

  it('keeps its own clock rate against the scene', () => {
    const flag: BlitSource = {
      id: 3,
      name: 'Flag',
      code: "size(1, 1); fps(6); cycle(2); out(frames(solid('#e43b44'), solid('#41a6f6')))",
    };
    const code = "size(4, 4); fps(12); out(blit('Flag', 0, 0))";
    const options = { blits: libraryOf([flag]) };
    // 12fps scene, 6fps flag: two scene frames per flag frame.
    expect([0, 1, 2, 3].map((f) => pixel(code, 0, 0, options, f))).toEqual([R, R, B, B]);
  });

  it('records each placed instance with where it is and how big', () => {
    const sketch = evaluateSketch("size(16, 16); out(scene(blit('Coin', 3, 4), blit('Coin', 9, 1)))", { blits });
    expect(sketch.blits.map((c) => c.id)).toEqual([0, 1]);
    const [a, b] = [sketch.instances.get(0), sketch.instances.get(1)];
    expect(a).toMatchObject({ name: 'Coin', sketchId: 1, w: 2, h: 2, pos: { x: 3, y: 4 }, repeated: false });
    expect(b?.pos).toEqual({ x: 9, y: 1 });
  });

  it('marks a call that ran more than once as repeated', () => {
    const sketch = evaluateSketch("size(16, 16); out(scene(...[0, 4].map((i) => blit('Coin', i, 0))))", { blits });
    expect(sketch.instances.get(0)?.repeated).toBe(true);
  });

  it('moves on screen when its position holder is written, with no re-evaluation', () => {
    const sketch = evaluateSketch("size(8, 8); out(blit('Coin', 0, 0))", { blits });
    const o: RenderOptions = { w: 8, h: 8, frame: 0, fps: 12, cycle: 8 };
    const instance = sketch.instances.get(0)!;
    instance.pos.x = 5;
    const data = renderToRgba(sketch.pattern, o);
    expect(data[3]).toBe(0);
    expect(data[5 * 4 + 3]).toBe(255);
  });
});

describe('scene mode can pick an instance, and paint cannot reach into one', () => {
  const blits = libraryOf([COIN]);
  const code = "size(8, 8); out(scene(sprite(`ww\nww`), blit('Coin', 4, 4), blit('Coin', 5, 5)))";
  const o: RenderOptions = { w: 8, h: 8, frame: 0, fps: 12, cycle: 8 };

  it('answers the topmost placed sketch under a pixel', () => {
    const sketch = evaluateSketch(code, { blits });
    expect(probeAt(sketch.pattern, o, 4, 4, 'blit')?.sourceId).toBe(0);
    expect(probeAt(sketch.pattern, o, 5, 5, 'blit')?.sourceId).toBe(1);
    expect(probeAt(sketch.pattern, o, 0, 0, 'blit')).toBeNull();
  });

  it('never answers a paint probe from a placed sketch’s own sprites', () => {
    const sketch = evaluateSketch(code, { blits });
    // The coin's sprite is literal 0 of ANOTHER sketch; answering it here would
    // paint into this sketch's literal 0, the `ww` grid.
    expect(probeAt(sketch.pattern, o, 5, 5)).toBeNull();
    expect(probeAt(sketch.pattern, o, 0, 0)?.sourceId).toBe(0);
  });

  it('keeps the placed sketch’s characters out of this one’s palette', () => {
    const sketch = evaluateSketch(code, { blits });
    expect(sketch.chars.map((c) => c.ch)).toEqual(['w']);
    expect(sketch.warnings).toEqual([]);
  });
});

describe('what cannot be placed', () => {
  function failure(code: string, options: EvaluateOptions): BlitError {
    try {
      evaluateSketch(code, options);
    } catch (error) {
      if (error instanceof BlitError) return error;
      throw error;
    }
    throw new Error('expected that to fail');
  }

  it('refuses a sketch that places itself', () => {
    const self: BlitSource = { id: 7, name: 'Loop', code: "out(blit('Loop'))" };
    expect(failure(self.code, { blits: libraryOf([self]), selfId: 7 }).message).toMatch(/never finish drawing/);
  });

  it('refuses a cycle through another sketch, naming the path', () => {
    const a: BlitSource = { id: 1, name: 'A', code: "out(blit('B'))" };
    const b: BlitSource = { id: 2, name: 'B', code: "out(blit('A'))" };
    const error = failure(a.code, { blits: libraryOf([a, b]), selfId: 1 });
    expect(error.phase).toBe('run');
    expect(error.message).toMatch(/^blit\('B'\): blit\('A'\) places a sketch that places this one/);
  });

  it('reports a reference that names nothing, in the resolver’s words', () => {
    expect(failure("out(blit('Nope'))", { blits: libraryOf([]) }).message).toMatch(/No saved sketch is called 'Nope'/);
  });

  it('says what the argument should be', () => {
    expect(failure('out(blit())', { blits: libraryOf([]) }).message).toMatch(/takes a sketch's name or id/);
  });

  it('reports a broken placed sketch under its own name', () => {
    const broken: BlitSource = { id: 4, name: 'Broken', code: "out(sprite(`w`).nope())" };
    expect(failure("out(blit('Broken'))", { blits: libraryOf([broken]) }).message).toMatch(/^blit\('Broken'\): /);
  });

  it('draws a still-loading sketch as nothing and says the scene is pending', () => {
    const sketch = evaluateSketch("size(4, 4); out(scene(solid('#41a6f6'), blit('Coin', 0, 0)))", {
      blits: libraryOf([COIN], ['Coin']),
    });
    expect(sketch.pending).toBe(true);
    expect(sketch.instances.get(0)?.sketchId).toBeNull();
    const data = renderToRgba(sketch.pattern, { w: 4, h: 4, frame: 0, fps: 12, cycle: 8 });
    expect(data[2]).toBe(0xf6);
  });
});
