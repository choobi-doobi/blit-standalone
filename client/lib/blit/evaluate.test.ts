import { describe, expect, it } from 'vitest';

import { parseColor, TRANSPARENT } from './color';
import { BlitError, DEFAULT_SETTINGS, evaluateSketch } from './evaluate';
import { siteFromError } from './errorSite';
import { makeCtx, renderToRgba, type RenderOptions } from './render';

const W = parseColor('#ffffff');
const R = parseColor('#e43b44');

/** The BlitError a sketch fails with, or a failure saying it did not fail. */
function failureOf(code: string): BlitError {
  try {
    evaluateSketch(code);
  } catch (error) {
    if (error instanceof BlitError) return error;
    throw error;
  }
  throw new Error('that sketch was expected to fail and did not');
}

function ctxFor(sketch: ReturnType<typeof evaluateSketch>, frame = 0) {
  const { w, h, fps, cycle, ramp } = sketch.settings;
  const options: RenderOptions = { w, h, frame, fps, cycle, ramp };
  return makeCtx(options);
}

describe('call shapes', () => {
  it('takes a bare expression as the sketch', () => {
    const sketch = evaluateSketch('sprite(`w`)');
    expect(sketch.pattern.at(0, 0, ctxFor(sketch))).toBe(W);
  });

  it('takes a multi-line chained expression', () => {
    const sketch = evaluateSketch('sprite(`w.`)\n  .flip("x")');
    expect(sketch.pattern.at(1, 0, ctxFor(sketch))).toBe(W);
  });

  it('takes statements with an explicit out()', () => {
    const sketch = evaluateSketch('const p = sprite(`w`);\nout(p);');
    expect(sketch.pattern.at(0, 0, ctxFor(sketch))).toBe(W);
  });

  it('takes statements with an explicit return', () => {
    const sketch = evaluateSketch('const p = sprite(`w`);\nreturn p;');
    expect(sketch.pattern.at(0, 0, ctxFor(sketch))).toBe(W);
  });

  it('lets out() win over a returned value', () => {
    const sketch = evaluateSketch('out(sprite(`w`));\nreturn sprite(`.`);');
    expect(sketch.pattern.at(0, 0, ctxFor(sketch))).toBe(W);
  });

  it('tolerates a trailing line comment on the last expression', () => {
    const sketch = evaluateSketch('sprite(`w`) // the whole sketch');
    expect(sketch.pattern.at(0, 0, ctxFor(sketch))).toBe(W);
  });

  it('coerces a bare color string into a pattern', () => {
    const sketch = evaluateSketch('"#ffffff"');
    expect(sketch.pattern.at(3, 3, ctxFor(sketch))).toBe(W);
  });
});

describe('settings', () => {
  it('defaults when the sketch says nothing', () => {
    expect(evaluateSketch('sprite(`w`)').settings).toEqual(DEFAULT_SETTINGS);
  });

  it('reads size, fps, cycle and ramp', () => {
    const sketch = evaluateSketch('size(16, 8); fps(24); cycle(12); ramp("pico8"); out(sprite(`w`))');
    expect(sketch.settings).toEqual({ w: 16, h: 8, fps: 24, cycle: 12, ramp: 'pico8' });
  });

  it('treats a single size argument as square', () => {
    expect(evaluateSketch('size(20); out(sprite(`w`))').settings).toMatchObject({ w: 20, h: 20 });
  });

  it('clamps nonsense rather than rendering a 2 billion pixel canvas', () => {
    const sketch = evaluateSketch('size(99999, -4); fps(0); cycle(0); out(sprite(`w`))');
    expect(sketch.settings).toMatchObject({ w: 512, h: 1, fps: 1, cycle: 1 });
  });

  it('lets the last call win', () => {
    expect(evaluateSketch('size(8); size(12); out(sprite(`w`))').settings).toMatchObject({ w: 12 });
  });

  it('rejects an unknown ramp, naming the valid ones', () => {
    expect(() => evaluateSketch('ramp("nope"); out(sprite(`w`))')).toThrow(/Unknown ramp/);
    expect(() => evaluateSketch('ramp("nope"); out(sprite(`w`))')).toThrow(/pico8/);
  });
});

describe('errors', () => {
  it('reports a syntax error as the compile phase', () => {
    try {
      evaluateSketch('sprite(`w`').at;
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(BlitError);
      expect((error as BlitError).phase).toBe('compile');
    }
  });

  it('reports a thrown error as the run phase, keeping the message', () => {
    try {
      evaluateSketch('throw new Error("boom");');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as BlitError).phase).toBe('run');
      expect((error as BlitError).message).toBe('boom');
    }
  });

  it('says so when a sketch produces nothing', () => {
    expect(() => evaluateSketch('const p = sprite(`w`);')).toThrow(/produced no pattern/);
  });

  it('says so when a sketch produces something that is not a pattern', () => {
    expect(() => evaluateSketch('out({});')).toThrow(/not a pattern/);
  });

  it('surfaces a bad color from inside the sketch', () => {
    expect(() => evaluateSketch('sprite(`w`).pal({ w: "octarine" })')).toThrow(/Not a color/);
  });
});

/**
 * A sketch that declares a name the language already binds.
 *
 * Every API name is a parameter of the compiled function, so `const grad = ...`
 * is a redeclaration and the sketch cannot run. That is fair. What was not fair
 * was the report: both compile forms fail, and the fallback always told the user
 * about the EXPRESSION form's failure, which for a sketch of statements is
 * always the meaningless "Unexpected token ';'" at the first semicolon. The real
 * reason was in the other error the whole time.
 */
describe('a sketch that shadows a name the language owns', () => {
  const shadowing = "size(16, 16);\nconst grad = (a, b) => a;\nout(sprite(`ww`));\n";

  it('names the built-in instead of blaming a semicolon', () => {
    const failure = failureOf(shadowing);
    expect(failure.phase).toBe('compile');
    expect(failure.message).not.toMatch(/Unexpected token/);
    expect(failure.message).toMatch(/grad/);
  });

  it('points at the line that declares it', () => {
    // The raw buffer is perfectly good JavaScript on its own, so the grammar has
    // nothing to report and the position has to come from the declaration.
    expect(failureOf(shadowing).site?.line).toBe(2);
  });

  it('catches a shadow of any API name, not just the one that was reported', () => {
    for (const name of ['sprite', 'stack', 'out', 'fn', 'rgb', 'text']) {
      const failure = failureOf(`size(8, 8);\nlet ${name} = 1;\nout(sprite(\`w\`));\n`);
      expect(failure.message, name).toMatch(new RegExp(`'${name}'`));
    }
  });

  it('still reports a sketch that declares its OWN name twice', () => {
    const failure = failureOf('size(8, 8);\nconst a = 1;\nconst a = 2;\nout(sprite(`w`));\n');
    expect(failure.message).toMatch(/already been declared/);
    // The second one is the mistake; the first was fine until it arrived.
    expect(failure.site?.line).toBe(3);
  });

  it('prefers the statement form for any statement sketch that will not parse', () => {
    // Not about shadowing: an unclosed call in a statement sketch used to report
    // the same useless semicolon, because the expression form fails there first.
    const failure = failureOf('size(8, 8);\nout(sprite(`w`);\n');
    expect(failure.message).not.toBe("Unexpected token ';'");
  });

  it('leaves an expression sketch reporting its own error', () => {
    // No semicolon, so nothing here changes: the expression form is the one that
    // read the sketch the way it was written.
    expect(failureOf('sprite(`w`).mirror(').message).toMatch(/Unexpected|missing/i);
  });
});

describe('literals and grids', () => {
  it('registers one grid per tagged literal, keyed by id', () => {
    const sketch = evaluateSketch('stack(sprite(`ab`), sprite(`\n  cd\n  ef\n`))');
    expect(sketch.literals.map((l) => l.id)).toEqual([0, 1]);
    expect(sketch.grids.get(0)).toMatchObject({ width: 2, height: 1 });
    expect(sketch.grids.get(1)).toMatchObject({ width: 2, height: 2 });
  });

  it('registers nothing for an interpolating literal, so it is not clickable', () => {
    const sketch = evaluateSketch('const r = "ww"; out(sprite(`${r}`))');
    expect(sketch.literals).toEqual([]);
    expect(sketch.grids.size).toBe(0);
    // It still draws.
    expect(sketch.pattern.at(0, 0, ctxFor(sketch))).toBe(W);
  });

  it('builds a runtime sprite without a source id', () => {
    const sketch = evaluateSketch('const art = "ww"; out(sprite(art))');
    expect(sketch.literals).toEqual([]);
    expect(sketch.pattern.at(1, 0, ctxFor(sketch))).toBe(W);
  });
});

describe('inspection', () => {
  it('lists the characters in play with the color each resolved to', () => {
    const sketch = evaluateSketch('sprite(`\n  wr\n`)');
    expect(sketch.chars).toEqual([
      { ch: 'w', color: W },
      { ch: 'r', color: R },
    ]);
  });

  it('reports what an inner pal() actually did, which a source scan could not', () => {
    const sketch = evaluateSketch('sprite(`\n  aa\n`).pal({ a: "#e43b44" })');
    expect(sketch.chars).toEqual([{ ch: 'a', color: R }]);
    expect(sketch.warnings).toEqual([]);
  });

  it('warns about a character nothing maps, naming it', () => {
    const sketch = evaluateSketch('sprite(`\n  wZ\n`)');
    expect(sketch.warnings).toHaveLength(1);
    expect(sketch.warnings[0]).toContain("'Z'");
    expect(sketch.chars).toEqual([
      { ch: 'w', color: W },
      { ch: 'Z', color: null },
    ]);
  });

  it('does not warn about the transparent character', () => {
    expect(evaluateSketch('sprite(`\n  w.\n`)').warnings).toEqual([]);
  });

  it('keeps characters in the order the sketch introduces them', () => {
    const sketch = evaluateSketch('sprite(`\n  .rw\n  wr.\n`)');
    expect(sketch.chars.map((c) => c.ch)).toEqual(['.', 'r', 'w']);
  });

  it('reports the transparent character as transparent, not as unmapped', () => {
    const sketch = evaluateSketch('sprite(`\n  w.\n`)');
    expect(sketch.chars.find((c) => c.ch === '.')).toEqual({ ch: '.', color: TRANSPARENT });
  });
});

describe('the api surface', () => {
  it('exposes the color helpers to generative sketches', () => {
    const sketch = evaluateSketch('size(4, 1); out(fn((x) => hsl(x * 90, 1, 0.5)))');
    expect(sketch.pattern.at(0, 0, ctxFor(sketch))).toBe(parseColor('#ff0000'));
  });

  it('exposes the named ramps as data', () => {
    const sketch = evaluateSketch('size(2, 1); out(sprite(`01`).ramp(ramps.gameboy))');
    expect(sketch.pattern.at(0, 0, ctxFor(sketch))).toBe(parseColor('#0f380f'));
  });

  it('lets a sketch use ordinary JavaScript to build a pattern family', () => {
    const code = [
      'size(6, 1);',
      'const dot = (c) => sprite(`w`).pal({ w: c });',
      'out(stack(...["#ffffff", "#e43b44"].map((c, i) => dot(c).shift(i * 2, 0))));',
    ].join('\n');
    const sketch = evaluateSketch(code);
    expect(sketch.pattern.at(0, 0, ctxFor(sketch))).toBe(W);
    expect(sketch.pattern.at(2, 0, ctxFor(sketch))).toBe(R);
  });
});

describe('strict mode', () => {
  /**
   * A sketch is user code compiled with `new Function`, whose body is SLOPPY by
   * default. Sloppy mode turns a mistyped name into an assignment to a global:
   * `wdith = 32` silently does nothing to the sketch and writes `window.wdith`.
   *
   * Two things go wrong with that. The typo is invisible, so the sketch quietly
   * ignores what you asked for; and the write lands on the host page, where some
   * of the names a pixel sketch would plausibly pick are real and load-bearing
   * properties of `window` (`name`, `status`, `origin`, `close`, `length`).
   * Blit's whole failure story is "the error panel tells you what is wrong", and
   * this is the one class of mistake that bypasses it.
   */
  const leaks = () => globalThis as unknown as Record<string, unknown>;

  it('reports an undeclared assignment instead of leaking it to the page', () => {
    delete leaks().wdith;

    let thrown: unknown;
    try {
      evaluateSketch("wdith = 32; out(sprite('w'))");
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(BlitError);
    // 'run', not 'compile': it parses fine, it just cannot execute.
    expect((thrown as BlitError).phase).toBe('run');
    expect((thrown as BlitError).message).toMatch(/wdith/);
    // The point of the fix. Sloppy mode makes this `32`.
    expect(leaks().wdith).toBeUndefined();
  });

  it('is strict in the expression form too, not just the statement form', () => {
    // The evaluator compiles two different function bodies and the directive has
    // to be in both. A comma expression is still one expression, so this takes
    // the `return (...)` path.
    delete leaks().blitLeak;

    expect(() => evaluateSketch("(blitLeak = 1, sprite('w'))")).toThrow(BlitError);
    expect(leaks().blitLeak).toBeUndefined();
  });

  it('still runs ordinary declarations, loops and closures', () => {
    // Strict mode must not cost the sketch language anything it advertises.
    const code = [
      'size(4, 1);',
      'let acc = empty();',
      'for (var i = 0; i < 2; i += 1) {',
      '  const dot = sprite(`w`).shift(i * 2, 0);',
      '  acc = stack(acc, dot);',
      '}',
      'out(acc);',
    ].join('\n');
    const sketch = evaluateSketch(code);
    expect(sketch.pattern.at(0, 0, ctxFor(sketch))).toBe(W);
    expect(sketch.pattern.at(2, 0, ctxFor(sketch))).toBe(W);
    expect(sketch.pattern.at(1, 0, ctxFor(sketch))).toBe(TRANSPARENT);
  });
});

describe('error positions', () => {
  /** Ask for a sketch's failure without the test having to try/catch inline. */
  it('points at the line a syntax error broke, in the user buffer', () => {
    // The position cannot come from the engine here: a `new Function` parse
    // failure has nothing positional in its stack. It comes from the grammar.
    const failure = failureOf('let a = 1;\nlet b = 2;\nlet c = (;\nout(empty());');
    expect(failure.phase).toBe('compile');
    expect(failure.site?.line).toBe(3);
  });

  it('points at the line a statement-form sketch threw on', () => {
    const failure = failureOf("let a = 1;\nlet b = 2;\nthrow new Error('boom');\n");
    expect(failure.phase).toBe('run');
    expect(failure.message).toBe('boom');
    expect(failure.site?.line).toBe(3);
  });

  it('points at the line an expression-form sketch threw on', () => {
    // A different prologue, so the same raw stack line means a different sketch
    // line. Getting this wrong is an off-by-one on every reported position.
    const failure = failureOf("(() => {\n  throw new Error('boom');\n})()");
    expect(failure.phase).toBe('run');
    expect(failure.site?.line).toBe(2);
  });

  it('names the line of a mistyped assignment, which is why strict mode is on', () => {
    const failure = failureOf('let ok = 1;\nwdith = 32;\nout(empty());\n');
    expect(failure.message).toContain('wdith');
    expect(failure.site?.line).toBe(2);
  });

  it('is not shifted by the sprite rewrite that happens before compiling', () => {
    // `sprite(` is rewritten to `__spriteAt(<id>, ` before the sketch is
    // compiled. That is longer, so columns move; it must stay on ONE line, or
    // every position after a sprite literal is silently wrong.
    const failure = failureOf(
      'let s = sprite(`\n  ww\n  ww\n`);\nthrow new Error("after the sprite");\n',
    );
    expect(failure.site?.line).toBe(5);
  });

  it('locates a throw that only happens while drawing', () => {
    // Frame 0 does not catch this one: the callback runs per pixel, and this
    // sketch only throws off the first row. The sketch itself evaluates fine.
    // No trailing semicolon, so this one really is the EXPRESSION form: a `;`
    // inside `return ( ... )` is a syntax error and drops it to the other shape.
    const sketch = evaluateSketch('out(fn((x, y) => {\n  if (y > 0) throw new Error("late");\n  return 0;\n}))');
    expect(sketch.form).toBe('expression');
    let site: ReturnType<typeof siteFromError> = null;
    try {
      renderToRgba(sketch.pattern, { w: 4, h: 4, frame: 0, fps: 12, cycle: 8, ramp: 'default' });
    } catch (error) {
      site = siteFromError(error, sketch.form);
    }
    expect(site?.line).toBe(2);
  });

  it('reports which form it compiled as, since the two need different arithmetic', () => {
    expect(evaluateSketch('sprite(`ww`)').form).toBe('expression');
    expect(evaluateSketch('let a = 1;\nout(sprite(`ww`));').form).toBe('statement');
  });

  it('leaves the site null when there is nothing sound to report', () => {
    // "produced no pattern" is Blit's own complaint about the sketch as a whole,
    // not a thing that happened at a place in it.
    const failure = failureOf('undefined');
    expect(failure.phase).toBe('run');
    expect(failure.site).toBeNull();
  });
});

/*
 * docs/language.md, "Alpha and transparency", states each form's alpha range.
 * These pin the table and the glow example so the page cannot drift from the
 * engine: an agent reading it avoided translucency altogether when it did not say.
 */
describe('alpha, as documented', () => {
  const alphaOf = (code: string): number => {
    const sketch = evaluateSketch(code);
    return sketch.pattern.at(0, 0, ctxFor(sketch)) & 0xff;
  };

  it('reads rgb() and grey() alpha as 0-255, hsl() alpha as 0-1, hex alpha as a byte', () => {
    expect(alphaOf('solid(rgb(65, 166, 246, 90))')).toBe(90);
    expect(alphaOf('solid(grey(255, 90))')).toBe(90);
    expect(alphaOf('solid(hsl(205, 0.9, 0.6, 0.35))')).toBe(89);
    expect(alphaOf("solid('#41a6f65a')")).toBe(0x5a);
    expect(alphaOf("solid('#4af6')")).toBe(0x66);
    // The trap the table warns about: a fraction given to rgb() is nearly invisible.
    expect(alphaOf('solid(rgb(255, 0, 0, 0.5))')).toBe(1);
  });

  it('blends the documented glow over its background rather than replacing it', () => {
    const sketch = evaluateSketch(`size(32, 32);
const bg   = solid('#1a1c2c');
const halo = circle(10, '#41a6f628').center();
const glow = circle(6, rgb(115, 239, 247, 90)).center();
const core = circle(2, '#ffffff').center();
out(stack(bg, halo, glow, core));`);
    const ctx = ctxFor(sketch);
    const bg = parseColor('#1a1c2c');
    const corner = sketch.pattern.at(0, 0, ctx);
    const inHalo = sketch.pattern.at(16, 7, ctx);
    const inGlow = sketch.pattern.at(16, 11, ctx);
    expect(corner).toBe(bg);
    // Opaque, because the background under it is, and neither the background
    // nor the layer's own colour: a mix of the two.
    for (const c of [inHalo, inGlow]) {
      expect(c & 0xff).toBe(255);
      expect(c).not.toBe(bg);
    }
    expect(inHalo).not.toBe(parseColor('#41a6f6'));
    expect(inGlow >>> 24).toBeGreaterThan(inHalo >>> 24);
    expect(sketch.pattern.at(16, 16, ctx)).toBe(W);
  });
});
