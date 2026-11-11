import { describe, expect, it } from 'vitest';

import { PAT_MEMBERS, PAT_OPERATORS } from './api';
import { SILENCE, toAudioFrame, type AudioFrame } from './audio';
import { parseColor, rgba, TRANSPARENT, type Color } from './color';
import { parseSpriteGrid } from './grid';
import { makeCtx, probeAt, renderSheet, renderToRgba, type RenderOptions } from './render';
import {
  checker,
  circle,
  empty,
  fn,
  frames,
  grad,
  live,
  noise,
  rect,
  solid,
  sprite,
  spriteFromGrid,
  stack,
  toPat,
  type Ctx,
  type Pat,
} from './pattern';

const W = parseColor('#ffffff');
const K = parseColor('#000000');
const R = parseColor('#e43b44');

function options(over: Partial<RenderOptions> = {}): RenderOptions {
  return { w: 8, h: 8, frame: 0, fps: 12, cycle: 4, ...over };
}

function ctx(over: Partial<RenderOptions> = {}): Ctx {
  return makeCtx(options(over));
}

/** Sample a pattern into a grid of characters, for readable assertions. */
function draw(pat: Pat, o: RenderOptions = options(), legend: Record<string, Color> = { '#': W, k: K, r: R }): string[] {
  const c = makeCtx(o);
  const rows: string[] = [];
  for (let y = 0; y < c.h; y += 1) {
    let row = '';
    for (let x = 0; x < c.w; x += 1) {
      const got = pat.at(x, y, c);
      if (got === TRANSPARENT) {
        row += '.';
        continue;
      }
      const match = Object.entries(legend).find(([, color]) => color === got);
      row += match ? match[0] : '?';
    }
    rows.push(row);
  }
  return rows;
}

describe('sprite', () => {
  const ship = sprite(`
    .w.
    www
  `);

  it('resolves letters from the default palette and dots to transparent', () => {
    expect(ship.at(1, 0, ctx())).toBe(W);
    expect(ship.at(0, 0, ctx())).toBe(TRANSPARENT);
  });

  it('carries its intrinsic size', () => {
    expect([ship.w, ship.h]).toEqual([3, 2]);
  });

  it('is transparent outside its box', () => {
    for (const [x, y] of [[-1, 0], [3, 0], [0, -1], [0, 2]]) {
      expect(ship.at(x, y, ctx())).toBe(TRANSPARENT);
    }
  });

  it('resolves digits through the active ramp', () => {
    const ramped = sprite('09').ramp(['#000000', '#111111', '#222222', '#333333', '#444444', '#555555', '#666666', '#777777', '#888888', '#ffffff']);
    expect(ramped.at(0, 0, ctx())).toBe(K);
    expect(ramped.at(1, 0, ctx())).toBe(W);
  });

  it('leaves an unmapped character transparent', () => {
    expect(sprite('Z').at(0, 0, ctx())).toBe(TRANSPARENT);
  });
});

describe('stack', () => {
  it('draws later arguments on top', () => {
    expect(stack(solid('#000000'), solid('#ffffff')).at(0, 0, ctx())).toBe(W);
  });

  it('shows the lower layer through a transparent hole', () => {
    const holed = sprite(`
      #.#
    `).pal({ '#': '#ffffff' });
    const composed = stack(solid('#000000'), holed);
    expect(draw(composed, options({ w: 3, h: 1 }))).toEqual(['#k#']);
  });

  it('composites a translucent layer rather than replacing', () => {
    const result = stack(solid('#ffffff'), solid('#00000080')).at(0, 0, ctx());
    expect(result).not.toBe(K);
    expect(result).not.toBe(W);
  });

  it('is the identity on one layer and empty on none', () => {
    const one = solid('#ffffff');
    expect(stack(one)).toBe(one);
    expect(stack().at(0, 0, ctx())).toBe(TRANSPARENT);
  });
});

describe('space', () => {
  const corner = sprite(`
    #.
    ..
  `).pal({ '#': '#ffffff' });

  it('shifts by whole pixels, positive being right and down', () => {
    expect(draw(corner.shift(1, 1), options({ w: 2, h: 2 }))).toEqual(['..', '.#']);
  });

  it('flips, replacing the original', () => {
    expect(draw(corner.flip('x'), options({ w: 2, h: 2 }))).toEqual(['.#', '..']);
    expect(draw(corner.flip('y'), options({ w: 2, h: 2 }))).toEqual(['..', '#.']);
  });

  it('mirrors one half onto the other, which is symmetry not reflection', () => {
    const half = sprite(`
      #..
      .#.
    `).pal({ '#': '#ffffff' });
    // Width 3: columns 0 kept, column 2 takes column 0, column 1 is the centre.
    expect(draw(half.mirror('x'), options({ w: 3, h: 2 }))).toEqual(['#.#', '.#.']);
  });

  it('mirrors from the high side when asked', () => {
    const half = sprite(`
      ..#
    `).pal({ '#': '#ffffff' });
    expect(draw(half.mirror('x', 'high'), options({ w: 3, h: 1 }))).toEqual(['#.#']);
  });

  it('rotates by 90 degrees clockwise and swaps the box', () => {
    const tall = sprite(`
      #.
      ..
      ..
    `).pal({ '#': '#ffffff' });
    expect([tall.w, tall.h]).toEqual([2, 3]);
    const turned = tall.rot(90);
    expect([turned.w, turned.h]).toEqual([3, 2]);
    // The top-left pixel travels to the top-right.
    expect(draw(turned, options({ w: 3, h: 2 }))).toEqual(['..#', '...']);
  });

  it('rotates 180 and 270 consistently, and 360 is identity', () => {
    const p = sprite(`
      #..
      ...
    `).pal({ '#': '#ffffff' });
    expect(draw(p.rot(180), options({ w: 3, h: 2 }))).toEqual(['...', '..#']);
    expect(draw(p.rot(90).rot(90).rot(90).rot(90), options({ w: 3, h: 2 }))).toEqual(draw(p, options({ w: 3, h: 2 })));
    expect(p.rot(360)).toBe(p);
  });

  it('tiles on its own box', () => {
    const dot = sprite(`
      #.
    `).pal({ '#': '#ffffff' });
    expect(draw(dot.tile(), options({ w: 6, h: 1 }))).toEqual(['#.#.#.']);
  });

  it('scales each pixel into a block and grows the box', () => {
    const dot = sprite('#').pal({ '#': '#ffffff' });
    const big = dot.scale(2);
    expect([big.w, big.h]).toEqual([2, 2]);
    expect(draw(big, options({ w: 3, h: 3 }))).toEqual(['##.', '##.', '...']);
  });

  it('crops to a window that becomes the new box at the origin', () => {
    const row = sprite('.#.').pal({ '#': '#ffffff' });
    const cut = row.crop(1, 0, 1, 1);
    expect([cut.w, cut.h]).toEqual([1, 1]);
    expect(cut.at(0, 0, ctx())).toBe(W);
  });

  it('centres its box on the canvas', () => {
    const dot = sprite('#').pal({ '#': '#ffffff' });
    expect(draw(dot.center(), options({ w: 3, h: 3 }))).toEqual(['...', '.#.', '...']);
  });
});

describe('masking and color', () => {
  const full = solid('#ffffff');
  const leftHalf = sprite(`
    #.
  `).pal({ '#': '#ffffff' });

  it('masks to where the other pattern is visible', () => {
    expect(draw(full.mask(leftHalf), options({ w: 2, h: 1 }))).toEqual(['#.']);
  });

  it('cuts away where the other pattern is visible', () => {
    expect(draw(full.cut(leftHalf), options({ w: 2, h: 1 }))).toEqual(['.#']);
  });

  it('tints, keeping the shape and multiplying the alphas', () => {
    const tinted = leftHalf.tint('#e43b44');
    expect(tinted.at(0, 0, ctx())).toBe(R);
    expect(tinted.at(1, 0, ctx())).toBe(TRANSPARENT);
    // A half-alpha tint halves the result's alpha rather than ignoring it.
    expect(leftHalf.tint('#e43b4480').at(0, 0, ctx()) & 0xff).toBe(0x80);
  });

  it('recolors through a lookup table and through a function', () => {
    expect(leftHalf.recolor({ '#ffffff': '#e43b44' }).at(0, 0, ctx())).toBe(R);
    expect(leftHalf.recolor(() => '#e43b44').at(0, 0, ctx())).toBe(R);
  });

  it('leaves holes alone, so recolor cannot accidentally fill the background', () => {
    expect(leftHalf.recolor(() => '#e43b44').at(1, 0, ctx())).toBe(TRANSPARENT);
    expect(leftHalf.recolor({ '#ffffff': '#e43b44' }).at(1, 0, ctx())).toBe(TRANSPARENT);
  });

  it('rebinds characters with pal, scoped to what it wraps', () => {
    const art = sprite('a');
    expect(art.pal({ a: '#e43b44' }).at(0, 0, ctx())).toBe(R);
    // The wrapper does not leak: the same sprite outside it is unaffected.
    expect(art.at(0, 0, ctx())).toBe(TRANSPARENT);
  });

  it('lets the later of two chained pal calls win, as the chain reads', () => {
    // The context flows down the tree, so without flattening the INNER call
    // would win and this would draw red.
    expect(sprite('a').pal({ a: '#e43b44' }).pal({ a: '#ffffff' }).at(0, 0, ctx())).toBe(W);
  });

  it('shifts the ramp a chained ramp call named, not the default one', () => {
    const p = sprite('0').ramp(['#e43b44', '#ffffff']).palShift(1);
    expect(p.at(0, 0, ctx({ frame: 0, cycle: 4 }))).toBe(R);
    expect(p.at(0, 0, ctx({ frame: 4, cycle: 4 }))).toBe(W);
  });

  it('lets the later of two chained ramp calls win', () => {
    const p = sprite('0').ramp(['#e43b44']).ramp(['#ffffff']);
    expect(p.at(0, 0, ctx())).toBe(W);
  });

  it('lets a pal on one layer beat a pal on the whole stack', () => {
    const composed = stack(sprite('a').pal({ a: '#e43b44' }), sprite('.a')).pal({ a: '#ffffff' });
    expect(composed.at(0, 0, ctx())).toBe(R); // the layer's own binding
    expect(composed.at(1, 0, ctx())).toBe(W); // the stack-wide binding
  });

  it('does not let a mask pattern claim the pixel it only gated', () => {
    // The mask decides, it does not draw. A probe must land on the content.
    const content = sprite('ww');
    const gate = sprite('w.');
    const probe = { mode: 'any' as const, hit: null as unknown };
    content.mask(gate).at(0, 0, { ...ctx(), probe } as never);
    // Neither sprite is tagged, so nothing is recorded either way; the guard
    // that matters is the end-to-end one in paint.test.ts.
    expect(probe.hit).toBeNull();
  });

  it('outlines visible pixels, underneath, without touching the original', () => {
    const dot = sprite('#').pal({ '#': '#ffffff' }).center();
    const outlined = dot.outline('#000000');
    expect(draw(outlined, options({ w: 3, h: 3 }))).toEqual(['.k.', 'k#k', '.k.']);
  });

  it('outlines diagonally when asked', () => {
    const dot = sprite('#').pal({ '#': '#ffffff' }).center();
    expect(draw(dot.outline('#000000', true), options({ w: 3, h: 3 }))).toEqual(['kkk', 'k#k', 'kkk']);
  });

  it('keeps the sized layer\'s box when an unsized layer stacks onto it', () => {
    // `outline` stacks an unsized ring over a sized sprite. If that erased the
    // box, every `.outline().center()` would silently stop centring.
    const dot = sprite('#').pal({ '#': '#ffffff' });
    expect([dot.outline('#000000').w, dot.outline('#000000').h]).toEqual([1, 1]);
  });

  it('centres an outlined sprite, the order people actually write', () => {
    const dot = sprite('#').pal({ '#': '#ffffff' }).outline('#000000').center();
    expect(draw(dot, options({ w: 3, h: 3 }))).toEqual(['.k.', 'k#k', '.k.']);
  });

  it('drops a shadow as an offset tinted copy underneath', () => {
    const dot = sprite('#').pal({ '#': '#ffffff' });
    const shadowed = dot.shadow(1, 1, '#000000');
    expect(draw(shadowed, options({ w: 2, h: 2 }))).toEqual(['#.', '.k']);
  });

  it('dithers a gradient into two colors on a Bayer matrix', () => {
    const rows = draw(grad('#000000', '#ffffff', 0).dither('#000000', '#ffffff'), options({ w: 8, h: 4 }));
    const joined = rows.join('');
    // Both colors appear, and only those two.
    expect(joined).toMatch(/#/);
    expect(joined).toMatch(/k/);
    expect(joined).not.toMatch(/\?/);
    // The dark end stays dark and the light end light.
    expect(rows.every((r) => r[0] === 'k')).toBe(true);
    expect(rows.every((r) => r[7] === '#')).toBe(true);
  });
});

describe('time', () => {
  const a = solid('#000000');
  const b = solid('#ffffff');

  it('cycles frames one per tick', () => {
    const anim = frames(a, b);
    expect(anim.at(0, 0, ctx({ frame: 0 }))).toBe(K);
    expect(anim.at(0, 0, ctx({ frame: 1 }))).toBe(W);
    expect(anim.at(0, 0, ctx({ frame: 2 }))).toBe(K);
  });

  it('slows an animation by holding each frame, and fast is its inverse', () => {
    const anim = frames(a, b).slow(3);
    expect(anim.at(0, 0, ctx({ frame: 0 }))).toBe(K);
    expect(anim.at(0, 0, ctx({ frame: 2 }))).toBe(K);
    expect(anim.at(0, 0, ctx({ frame: 3 }))).toBe(W);
    expect(frames(a, b).fast(2).at(0, 0, ctx({ frame: 1 }))).toBe(K);
  });

  it('applies every n on the first of each n cycles', () => {
    // cycle 4, so frames 0-3 are cycle 0, 4-7 cycle 1, 8-11 cycle 2.
    const p = a.every(2, (q) => q.recolor(() => '#ffffff'));
    expect(p.at(0, 0, ctx({ frame: 0 }))).toBe(W); // cycle 0
    expect(p.at(0, 0, ctx({ frame: 4 }))).toBe(K); // cycle 1
    expect(p.at(0, 0, ctx({ frame: 8 }))).toBe(W); // cycle 2
  });

  it('divides the cycle between sequenced patterns', () => {
    const p = a.seq(b);
    expect(p.at(0, 0, ctx({ frame: 0 }))).toBe(K);
    expect(p.at(0, 0, ctx({ frame: 1 }))).toBe(K);
    expect(p.at(0, 0, ctx({ frame: 2 }))).toBe(W);
    expect(p.at(0, 0, ctx({ frame: 3 }))).toBe(W);
    expect(p.at(0, 0, ctx({ frame: 4 }))).toBe(K); // next cycle
  });

  it('holds the clock still', () => {
    const anim = frames(a, b).hold(1);
    expect(anim.at(0, 0, ctx({ frame: 0 }))).toBe(W);
    expect(anim.at(0, 0, ctx({ frame: 5 }))).toBe(W);
  });

  it('gates on a euclidean rhythm, which is uneven by design', () => {
    const p = b.euclid(2, 4);
    const onsets = [0, 1, 2, 3].map((frame) => p.at(0, 0, ctx({ frame, cycle: 4 })) !== TRANSPARENT);
    expect(onsets.filter(Boolean)).toHaveLength(2);
    expect(onsets[0]).toBe(true);
  });

  it('applies when on a condition of t', () => {
    const p = a.when((t) => t > 2, (q) => q.recolor(() => '#ffffff'));
    expect(p.at(0, 0, ctx({ frame: 1 }))).toBe(K);
    expect(p.at(0, 0, ctx({ frame: 3 }))).toBe(W);
  });

  it('shifts the digit ramp once per cycle', () => {
    const digits = sprite('0').ramp(['#000000', '#ffffff']).palShift(1);
    expect(digits.at(0, 0, ctx({ frame: 0, cycle: 4 }))).toBe(K);
    expect(digits.at(0, 0, ctx({ frame: 4, cycle: 4 }))).toBe(W);
    expect(digits.at(0, 0, ctx({ frame: 8, cycle: 4 }))).toBe(K);
  });

  it('degrades deterministically: same seed, same picture', () => {
    const p = solid('#ffffff').degrade(0.5, 7);
    const first = draw(p, options({ w: 8, h: 8 }));
    const second = draw(p, options({ w: 8, h: 8 }));
    expect(second).toEqual(first);
    const dropped = first.join('').split('').filter((c) => c === '.').length;
    expect(dropped).toBeGreaterThan(10);
    expect(dropped).toBeLessThan(54);
  });

  it('juxtaposes the original and a transform across the canvas halves', () => {
    const p = solid('#000000').jux((q) => q.recolor(() => '#ffffff'));
    expect(draw(p, options({ w: 4, h: 1 }))).toEqual(['kk##']);
  });

  it('renders a COMPLETE copy in each half, not one sprite split down the middle', () => {
    // Strudel's jux plays the whole pattern in each ear. The spatial analogue
    // has to give each half its own coordinate space, or a centred sprite lands
    // on the seam and you see one object in two colours instead of two objects.
    const dot = sprite('#').pal({ '#': '#ffffff' }).center();
    const p = dot.jux((q) => q.recolor(() => '#000000'));
    // Halves are 3 wide; a 1-wide sprite centres at local x=1, so canvas 1 and 4.
    expect(draw(p, options({ w: 6, h: 1 }))).toEqual(['.#..k.']);
  });
});

describe('generators', () => {
  it('builds a checkerboard that alternates', () => {
    expect(draw(checker('#000000', '#ffffff'), options({ w: 2, h: 2 }))).toEqual(['k#', '#k']);
  });

  it('runs a gradient corner to corner without clipping', () => {
    const g = grad('#000000', '#ffffff', 0);
    expect(g.at(0, 0, ctx({ w: 8, h: 8 }))).toBe(K);
    expect(g.at(7, 0, ctx({ w: 8, h: 8 }))).toBe(W);
  });

  it('makes seeded noise reproducible and seed-sensitive', () => {
    const c = ctx();
    expect(noise(1).at(3, 4, c)).toBe(noise(1).at(3, 4, c));
    expect(noise(1).at(3, 4, c)).not.toBe(noise(2).at(3, 4, c));
  });

  it('draws a filled circle inside its box', () => {
    expect(draw(circle(1, '#ffffff'), options({ w: 3, h: 3 }))).toEqual(['.#.', '###', '.#.']);
  });

  it('draws a rectangle at the origin', () => {
    expect(draw(rect(2, 1, '#ffffff'), options({ w: 3, h: 2 }))).toEqual(['##.', '...']);
  });

  it('wraps a raw function, passing t and accepting a color string', () => {
    const p = fn((x, _y, t) => (x === t ? '#ffffff' : null));
    expect(draw(p, options({ w: 3, h: 1, frame: 2 }))).toEqual(['..#']);
  });

  it('rejects a fn that returns something that is not a color', () => {
    expect(() => fn(() => ({}) as unknown).at(0, 0, ctx())).toThrow(/must return a color/);
  });

  it('is empty when empty', () => {
    expect(empty().at(0, 0, ctx())).toBe(TRANSPARENT);
  });
});

describe('coercion', () => {
  it('reads a color string as a fill and a glyph string as a sprite', () => {
    expect(toPat('#ffffff').at(0, 0, ctx())).toBe(W);
    expect(toPat('w.').at(0, 0, ctx())).toBe(W);
    expect(toPat('w.').at(1, 0, ctx())).toBe(TRANSPARENT);
  });

  it('reads a packed number as a fill and a function as a pattern', () => {
    expect(toPat(rgba(255, 255, 255)).at(0, 0, ctx())).toBe(W);
    expect(toPat(() => '#ffffff').at(0, 0, ctx())).toBe(W);
  });

  it('passes a pattern through untouched', () => {
    const p = solid('#ffffff');
    expect(toPat(p)).toBe(p);
  });
});

describe('render', () => {
  it('writes RGBA row major', () => {
    const data = renderToRgba(sprite('w.').pal({ w: '#e43b44' }), options({ w: 2, h: 1 }));
    expect([...data]).toEqual([0xe4, 0x3b, 0x44, 255, 0, 0, 0, 0]);
  });

  it('reuses a supplied buffer of the right size and replaces a wrong one', () => {
    const o = options({ w: 2, h: 1 });
    const buffer = new Uint8ClampedArray(2 * 1 * 4);
    expect(renderToRgba(solid('#ffffff'), o, buffer)).toBe(buffer);
    const wrong = new Uint8ClampedArray(3);
    expect(renderToRgba(solid('#ffffff'), o, wrong)).not.toBe(wrong);
  });

  it('lays a spritesheet out left to right, one frame per cell', () => {
    const anim = frames(solid('#000000'), solid('#ffffff'));
    const sheet = renderSheet(anim, options({ w: 1, h: 1, cycle: 2 }));
    expect([sheet.w, sheet.h]).toEqual([2, 1]);
    expect([...sheet.data]).toEqual([0, 0, 0, 255, 255, 255, 255, 255]);
  });
});

describe('live(): the one construct that makes a number reactive', () => {
  const LOUD = toAudioFrame({ fft: [0.9, 0.8, 0.7, 0.6], vol: 60, beat: true, sinceBeat: 0 });

  /** A live pattern plus a counter of how many times its body was run. */
  function counted(
    build: (a: AudioFrame, t: number) => Pat,
    w?: number,
    h?: number,
  ): { pat: Pat; seen: { builds: number } } {
    const seen = { builds: 0 };
    const pat = live((a, t) => {
      seen.builds += 1;
      return build(a, t);
    }, w, h);
    return { pat, seen };
  }

  it('rebuilds once per frame, not once per pixel', () => {
    // The whole cost argument. `derive` memoises on the CONTEXT's identity and a
    // render pass reuses one context for every pixel, so 1024 pixels is one
    // rebuild. Count-based on purpose: "it renders" would not notice a per-pixel
    // rebuild, and a per-pixel rebuild is the failure this design exists to
    // avoid.
    const { pat, seen } = counted(() => solid('#ffffff'));
    renderToRgba(pat, options({ w: 32, h: 32 }));
    expect(seen.builds).toBe(1);
  });

  it('rebuilds once per frame of a spritesheet', () => {
    const { pat, seen } = counted(() => solid('#ffffff'));
    renderSheet(pat, options({ w: 4, h: 4, cycle: 8 }), 8);
    expect(seen.builds).toBe(8);
  });

  it('still rebuilds once through a palette wrapper and a stack', () => {
    const { pat, seen } = counted(() => sprite('w'));
    renderToRgba(stack(solid('#000000'), pat.pal({ w: '#ffffff' })), options({ w: 16, h: 16 }));
    expect(seen.builds).toBe(1);
  });

  it('still rebuilds once under jux, which derives one context for both halves', () => {
    const { pat, seen } = counted(() => solid('#ffffff'));
    renderToRgba(pat.jux((p) => p), options({ w: 16, h: 16 }));
    expect(seen.builds).toBe(1);
  });

  it('misses the cache on a probe pass, once per probe mode, which is correct', () => {
    const { pat, seen } = counted(() => sprite('ww\nww'));
    probeAt(pat, options({ w: 4, h: 4 }), 0, 0);
    expect(seen.builds).toBe(2);
  });

  it('passes the probe through, so click-to-paint works inside a live body', () => {
    // `live` samples its child AT the requested coordinate, so provenance is
    // genuinely this pixel's and must not be stripped.
    const hit = probeAt(live(() => spriteFromGrid(parseSpriteGrid('ww\nww'), 7)), options({ w: 4, h: 4 }), 1, 0);
    expect(hit).toEqual({ sourceId: 7, col: 1, row: 0 });
  });

  it('honours the box it was given, because a rebuilt child cannot report one', () => {
    // A pattern's intrinsic box is read at CONSTRUCT time by `center` and
    // `crop`, and the box of a child that has not been built yet is not
    // knowable. Reporting nothing silently falls back to the canvas size.
    const boxed = live(() => sprite('w'), 8, 8).center();
    const loose = live(() => sprite('w')).center();
    expect(draw(boxed, options({ w: 32, h: 32 }))[12].indexOf('#')).toBe(12);
    expect(draw(loose, options({ w: 32, h: 32 }))[0].indexOf('#')).toBe(0);
  });

  it('reads the music per frame: the same frame renders differently under different audio', () => {
    const pat = live((a) => solid(rgba(a.vol * 4, 0, 0, 255)));
    const o = options({ w: 2, h: 2 });
    const quiet = [...renderToRgba(pat, o)];
    const loud = [...renderToRgba(pat, { ...o, audio: LOUD })];
    expect(loud).not.toEqual(quiet);
    expect(quiet[0]).toBe(0);
    expect(loud[0]).toBe(240);
  });

  it('is handed SILENCE when nothing supplies music', () => {
    let seen: AudioFrame | null = null;
    renderToRgba(
      live((a) => {
        seen = a;
        return empty();
      }),
      options({ w: 1, h: 1 }),
    );
    expect(seen).toBe(SILENCE);
  });

  it('accepts anything the algebra accepts, not only a Pat', () => {
    expect(draw(live(() => '#ffffff'), options({ w: 2, h: 1 }))).toEqual(['##']);
    expect(draw(live(() => (x: number) => (x === 0 ? '#ffffff' : null)), options({ w: 2, h: 1 }))).toEqual(['#.']);
  });
});

describe('.onBeat(): sugar over when(), on the audio clock', () => {
  const at = (sinceBeat: number): RenderOptions =>
    options({ w: 1, h: 1, audio: toAudioFrame({ sinceBeat }) });

  const flash = solid('#000000').onBeat(() => solid('#ffffff'));

  it('applies the transform on the onset frame', () => {
    expect(draw(flash, at(0))).toEqual(['#']);
  });

  it('leaves it alone once the onset has passed', () => {
    expect(draw(flash, at(0.5))).toEqual(['k']);
    expect(draw(flash, at(Infinity))).toEqual(['k']);
  });

  it('holds the transform for a window measured in SECONDS, not frames', () => {
    // A sketch runs on its own fps() while onsets arrive on the audio clock, so
    // counting frames would mean two different things at 12fps and at 60fps.
    const held = solid('#000000').onBeat(() => solid('#ffffff'), 0.25);
    expect(draw(held, at(0.2))).toEqual(['#']);
    expect(draw(held, at(0.3))).toEqual(['k']);
  });

  it('clamps a nonsense hold to the onset frame instead of throwing', () => {
    for (const bad of [NaN, -1, Infinity]) {
      const guarded = solid('#000000').onBeat(() => solid('#ffffff'), bad);
      expect(draw(guarded, at(0)), String(bad)).toEqual(['#']);
      expect(draw(guarded, at(0.5)), String(bad)).toEqual(['k']);
    }
  });

  it('reaches the vocabulary with no api.ts edit, because operators are read off the class', () => {
    expect(PAT_OPERATORS).toContain('onBeat');
    expect(PAT_MEMBERS).toContain('onBeat');
  });
});

describe('the retiming trap: fast/slow/hold move the clock, not the music', () => {
  /**
   * Documented rather than fixed, and this pins the behaviour that was
   * documented so the paragraph in docs/language.md cannot quietly stop being
   * true. `hold` and `fast` derive `{ ...ctx, frame }` and override ONLY the
   * frame, so a `live` body under `.hold(0)` keeps rebuilding with a frozen `t`
   * and a moving `ctx.audio`: the picture stops and the reactivity does not.
   *
   * Fixing it would mean inventing a semantics for "the music two frames ago",
   * which means the context carrying a ring buffer of past frames on every
   * render, and there is no correct answer for `.fast(2)` at all, because
   * retiming the clock forward asks for music from the future.
   */
  it('rebuilds a held live body every frame, at a frozen t, with live audio', () => {
    const seenT: number[] = [];
    const seenVol: number[] = [];
    const pat = live((a, t) => {
      seenT.push(t);
      seenVol.push(a.vol);
      return solid('#ffffff');
    }).hold(0);

    for (let frame = 0; frame < 4; frame += 1) {
      renderToRgba(pat, options({ w: 1, h: 1, frame, audio: toAudioFrame({ vol: frame * 10 }) }));
    }

    expect(seenT).toEqual([0, 0, 0, 0]);
    expect(seenVol).toEqual([0, 10, 20, 30]);
  });

  it('hands a sped-up body the sped-up clock and the present music', () => {
    const seenT: number[] = [];
    const pat = live((_a, t) => {
      seenT.push(t);
      return solid('#ffffff');
    }).fast(2);

    for (let frame = 0; frame < 4; frame += 1) {
      renderToRgba(pat, options({ w: 1, h: 1, frame }));
    }
    expect(seenT).toEqual([0, 2, 4, 6]);
  });
});
