import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SETTINGS,
  PAT_CHAINABLE,
  PAT_CONSTRUCTORS,
  PAT_INTERNAL,
  PAT_OPERATORS,
  PAT_MEMBERS,
  SKETCH_NAMES,
  SKETCH_VOCABULARY,
  createSketchApi,
  type SketchApiState,
} from './api';
import { SILENCE } from './audio';
import { Pat, defaultPalette, empty, resolveRamp, type Ctx } from './pattern';

const freshState = (): SketchApiState => ({
  settings: { ...DEFAULT_SETTINGS },
  grids: new Map(),
  sink: { value: undefined },
  // The evaluator's job; here it only has to answer a pattern.
  place: () => empty(),
});

const call = (name: string, ...args: unknown[]): unknown => {
  const api = createSketchApi(freshState());
  const f = api[name] as (...a: unknown[]) => unknown;
  return f(...args);
};

describe('the sketch API is one object, and the names are read off it', () => {
  it('lists exactly what it binds', () => {
    expect([...SKETCH_NAMES].sort()).toEqual(Object.keys(createSketchApi(freshState())).sort());
  });

  it('advertises everything except the scanner internals', () => {
    expect(SKETCH_VOCABULARY.filter((n) => n.startsWith('__'))).toEqual([]);
    expect(SKETCH_NAMES).toContain('__spriteAt');
  });

  /**
   * A guard, not a spec. `PAT_CONSTRUCTORS` cannot be derived from the object, so
   * this fails the moment the vocabulary grows — which is the prompt to decide
   * whether the new name builds a pattern. Update BOTH lists, or neither.
   */
  it('has a vocabulary that PAT_CONSTRUCTORS has been checked against', () => {
    const notPatterns = SKETCH_VOCABULARY.filter((n) => !PAT_CONSTRUCTORS.has(n));
    expect(notPatterns.sort()).toEqual(
      ['color', 'cycle', 'fps', 'gray', 'grey', 'hsl', 'ramp', 'ramps', 'rgb', 'rgba', 'size'].sort(),
    );
  });

  it('names nothing in PAT_CONSTRUCTORS that is not in scope', () => {
    for (const name of PAT_CONSTRUCTORS) expect(SKETCH_NAMES, name).toContain(name);
  });

  it('really does answer a pattern from each of them', () => {
    const args: Record<string, unknown[]> = {
      __spriteAt: [0, 'w'],
      sprite: ['w'],
      __blitAt: [0, 'Coin', 1, 2],
      blit: ['Coin', 1, 2],
      scene: [empty()],
      solid: ['#ffffff'],
      fill: ['#ffffff'],
      empty: [],
      fn: [() => '#ffffff'],
      frames: [empty(), empty()],
      // `live` takes a BUILD callback, so the argument that proves it answers a
      // Pat is a function returning one, not a pattern.
      live: [() => empty()],
      stack: [empty()],
      checker: [],
      grad: [],
      noise: [],
      circle: [2],
      rect: [2, 2],
      text: ['A'],
      out: [empty()],
    };
    for (const name of PAT_CONSTRUCTORS) {
      expect(Object.keys(args), `${name} needs arguments in this test`).toContain(name);
      expect(call(name, ...(args[name] ?? [])), name).toBeInstanceOf(Pat);
    }
  });
});

describe('blit() without a library', () => {
  it('says there is nothing to place from, rather than drawing nothing', () => {
    const api = createSketchApi({ settings: { ...DEFAULT_SETTINGS }, grids: new Map(), sink: { value: undefined } });
    expect(() => (api.blit as (r: string) => unknown)('Coin')).toThrow(/no saved sketches to place from/);
  });
});

describe('what a pattern answers', () => {
  it('counts every member of the real class', () => {
    for (const name of ['mirror', 'scale', 'pal', 'sample', 'w', 'h', 'toString']) {
      expect(PAT_MEMBERS, name).toContain(name);
    }
  });

  it('keeps the operators chainable', () => {
    for (const name of ['mirror', 'scale', 'pal', 'jux', 'euclid']) {
      expect(PAT_CHAINABLE, name).toContain(name);
    }
  });

  it('advertises the operators without the private machinery', () => {
    // `withMod` is on the prototype and is not part of the language. It stays
    // ACCEPTED — chainable and a known member — so the lint cannot report a call
    // to something that really exists; it is only kept out of what is offered.
    expect(PAT_OPERATORS).not.toContain('withMod');
    expect(PAT_CHAINABLE).toContain('withMod');
    expect(PAT_MEMBERS).toContain('withMod');
    expect(PAT_OPERATORS).toContain('mirror');
    // Asked of PAT_INTERNAL itself, not of what it removed: a stale name is
    // absent from the filtered list either way, so only the source list shows it.
    const onPrototype = new Set(Object.getOwnPropertyNames(Pat.prototype));
    expect(PAT_INTERNAL.size).toBeGreaterThan(0);
    for (const name of PAT_INTERNAL) {
      expect(onPrototype, name).toContain(name);
      expect(PAT_OPERATORS, name).not.toContain(name);
    }
  });

  it('offers the operators in a stable order', () => {
    expect([...PAT_OPERATORS]).toEqual([...PAT_OPERATORS].sort());
  });

  /** The reason `at`, `width` and `height` are excluded, proved rather than asserted. */
  it('does not chain off the members that answer something else', () => {
    const ctx: Ctx = {
      w: 4,
      h: 4,
      frame: 0,
      fps: 12,
      cycle: 8,
      pal: defaultPalette(),
      ramp: resolveRamp('default'),
      // The only bare `Ctx` literal in the tree. Every other site goes through
      // `makeCtx`, which supplies this default itself.
      audio: SILENCE,
    };
    expect(empty().at(0, 0, ctx)).not.toBeInstanceOf(Pat);
    for (const name of ['at', 'width', 'height']) {
      expect(PAT_MEMBERS, name).toContain(name);
      expect(PAT_CHAINABLE, name).not.toContain(name);
    }
  });
});

describe('the API writes back through the state it was given', () => {
  it('records the settings a sketch declares, clamped', () => {
    const state = freshState();
    const api = createSketchApi(state);
    (api.size as (w: number, h?: number) => void)(40, 9999);
    (api.fps as (n: number) => void)(0);
    (api.cycle as (n: number) => void)(4);
    expect(state.settings).toEqual({ w: 40, h: 512, fps: 1, cycle: 4, ramp: 'default' });
  });

  it('records what out() was handed', () => {
    const state = freshState();
    const pattern = empty();
    (createSketchApi(state).out as (p: unknown) => unknown)(pattern);
    expect(state.sink.value).toBe(pattern);
  });

  it('records each sprite grid against its source id', () => {
    const state = freshState();
    (createSketchApi(state).__spriteAt as (id: number, art: string) => unknown)(7, 'ww\nww');
    expect([...state.grids.keys()]).toEqual([7]);
  });
});
