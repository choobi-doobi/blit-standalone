import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { PAT_MEMBERS, SKETCH_VOCABULARY } from './api';
import { lintSketch, LINT_RULES, topLevelRedeclarations, type LintDiagnostic } from './lint';
import { parseSketch, siteOfOffset, syntaxSite } from './syntaxSite';

const rulesOf = (ds: LintDiagnostic[]): string[] => ds.map((d) => d.rule);
const errorsOf = (ds: LintDiagnostic[]): LintDiagnostic[] => ds.filter((d) => d.severity === 'error');

describe('lintSketch: the shapes a sketch is allowed to have', () => {
  it('accepts a bare expression and says so', () => {
    const r = lintSketch("sprite(`.ww.`).mirror('x').scale(4).center()");
    expect(r.diagnostics).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.form).toBe('expression');
  });

  it('accepts statements with an explicit sink', () => {
    const r = lintSketch("size(32, 32); fps(12);\nconst ship = sprite(`.w.`);\nout(ship);");
    expect(r.diagnostics).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.form).toBe('statement');
  });

  it('rejects statements that never reach out(), which always produce no pattern', () => {
    const r = lintSketch('size(16, 16);\nconst ship = sprite(`w`);');
    expect(rulesOf(r.diagnostics)).toEqual(['no-output']);
    expect(r.diagnostics[0]?.severity).toBe('error');
    expect(r.ok).toBe(false);
  });

  it('does not ask an expression sketch for an out() it does not need', () => {
    expect(rulesOf(lintSketch('sprite(`w`)').diagnostics)).not.toContain('no-output');
  });

  it('accepts out() referenced rather than called, which it cannot follow', () => {
    const r = lintSketch('const sink = out;\nsink(sprite(`w`));');
    expect(rulesOf(r.diagnostics)).not.toContain('no-output');
  });
});

describe('lintSketch: syntax', () => {
  it('reports where the grammar stopped, and nothing else', () => {
    const r = lintSketch('out(sprite(`w`)\n');
    expect(rulesOf(r.diagnostics)).toEqual(['syntax']);
    expect(r.ok).toBe(false);
    expect(r.form).toBe(null);
  });

  it('points at the same place the editor gutter would', () => {
    const code = "size(32, 32);\nconst a = sprite(`w`;\nout(a);";
    const site = syntaxSite(code);
    expect(site).not.toBeNull();
    const d = lintSketch(code).diagnostics[0];
    expect(d?.rule).toBe('syntax');
    expect({ line: d?.line, column: d?.column }).toEqual({ line: site?.line, column: site?.column });
  });

  it('does not chase identifiers through a tree it could not parse', () => {
    // `mirrror` is a typo, but the buffer is broken: reporting both would bury
    // the one finding that matters under noise from error nodes.
    expect(rulesOf(lintSketch('mirrror(sprite(`w`)').diagnostics)).toEqual(['syntax']);
  });
});

describe('lintSketch: names', () => {
  it('names a typo of a language function as an error, with the real name', () => {
    const r = lintSketch('sprit(`w`)');
    const errs = errorsOf(r.diagnostics);
    expect(errs).toHaveLength(1);
    expect(errs[0]?.rule).toBe('unknown-name');
    expect(errs[0]?.message).toContain('sprit');
    expect(errs[0]?.hint).toContain('sprite');
    expect(r.ok).toBe(false);
  });

  it('does not suggest a pattern METHOD for a name called on its own', () => {
    // `mirror` only exists on a pattern. Offering it as the fix for a bare
    // `mirrror(...)` call would send the caller somewhere that cannot work.
    const r = lintSketch('mirrror(sprite(`w`))');
    expect(r.diagnostics[0]?.severity).toBe('warning');
    expect(r.diagnostics[0]?.hint).not.toContain('mirror`');
  });

  it('positions the diagnostic on the name itself', () => {
    const d = lintSketch('size(8, 8);\nout(niose(0.5));').diagnostics[0];
    expect(d?.line).toBe(2);
    // `out(` is four characters, so the name starts at column 5.
    expect(d?.column).toBe(5);
    expect(d?.hint).toContain('noise');
  });

  it('warns rather than errors on a name it has no candidate for', () => {
    const r = lintSketch('out(somethingEntirelyElsewhere)');
    expect(rulesOf(r.diagnostics)).toEqual(['unknown-name']);
    expect(r.diagnostics[0]?.severity).toBe('warning');
    // A warning does not make the sketch invalid: the browser may well have it.
    expect(r.ok).toBe(true);
  });

  it('accepts every name the language actually binds', () => {
    for (const name of SKETCH_VOCABULARY) {
      const r = lintSketch(`out(String(${name}))`);
      expect(rulesOf(r.diagnostics), name).not.toContain('unknown-name');
    }
  });

  it('accepts the internal name the source scanner writes, without advertising it', () => {
    expect(rulesOf(lintSketch('__spriteAt(0, `w`)').diagnostics)).toEqual([]);
    expect(SKETCH_VOCABULARY.some((n) => n.startsWith('__'))).toBe(false);
  });

  it('accepts standard JavaScript globals', () => {
    const r = lintSketch('out(fn((x, y) => grey(Math.min(1, Number(JSON.stringify(x)) + y))))');
    expect(rulesOf(r.diagnostics)).toEqual([]);
  });

  it('accepts names the sketch binds itself, in every shape', () => {
    const code = [
      'const ship = sprite(`w`);',
      'let { w: wide, ...restp } = ship;',
      'const [first, ...others] = [1, 2, 3];',
      'function helper(a, { b }, [c], ...rest) { return a + b + c + rest.length + first + others.length; }',
      'for (const row of [1, 2]) { helper(row, { b: wide }, [restp]); }',
      'try { helper(1, { b: 2 }, [3]); } catch (err) { grey(err); }',
      'out(ship);',
    ].join('\n');
    expect(rulesOf(lintSketch(code).diagnostics)).toEqual([]);
  });

  it('does not mistake a property or a palette key for a name', () => {
    const r = lintSketch("sprite(`wc`).pal({ w: '#fff', c: '#000' }).mirror('x')");
    expect(r.diagnostics).toEqual([]);
  });

  it('reports each unknown name once, in source order', () => {
    const r = lintSketch('size(8, 8);\nout(stack(niose(1), niose(2), mirrror(empty)));');
    expect(rulesOf(r.diagnostics)).toEqual(['unknown-name', 'unknown-name']);
    expect(r.diagnostics.map((d) => d.column)).toEqual([11, 31]);
  });
});

describe('lintSketch: methods on a pattern', () => {
  it('reports a method a pattern does not have, with the real one', () => {
    const r = lintSketch("sprite(`w`).mirrror('x')");
    expect(rulesOf(r.diagnostics)).toEqual(['unknown-method']);
    expect(r.diagnostics[0]?.severity).toBe('error');
    expect(r.diagnostics[0]?.message).toContain('mirrror');
    expect(r.diagnostics[0]?.hint).toContain('mirror');
    expect(r.ok).toBe(false);
  });

  it('follows a chain through every operator it knows', () => {
    const r = lintSketch("sprite(`w`).mirror('x').scale(4).center().zzz()");
    expect(rulesOf(r.diagnostics)).toEqual(['unknown-method']);
    expect(r.diagnostics[0]?.message).toContain('zzz');
  });

  it('accepts every operator the Pat class actually has', () => {
    for (const name of PAT_MEMBERS) {
      if (name.startsWith('__') || name === 'constructor') continue;
      const r = lintSketch(`sprite(\`w\`).${name}`);
      expect(rulesOf(r.diagnostics), name).not.toContain('unknown-method');
    }
  });

  it('leaves methods on anything that is not a pattern alone', () => {
    const code = [
      'const list = [1, 2, 3];',
      'const label = String(Math.max(...list)).padStart(3, `0`);',
      'out(fn((x, y) => grey(list.indexOf(x) / label.length + y)));',
    ].join('\n');
    expect(lintSketch(code).diagnostics).toEqual([]);
  });

  it('stops following a chain once it is no longer a pattern', () => {
    // `.at()` answers a Color, so nothing after it is a pattern any more and the
    // check has no business guessing at Color's methods.
    const r = lintSketch('out(solid(`#fff`).at(0, 0).whateverThisIs)');
    expect(rulesOf(r.diagnostics)).toEqual([]);
  });

  it('does not treat a computed index as a method', () => {
    expect(lintSketch('out(frames(empty(), empty())[0] ?? empty())').diagnostics).toEqual([]);
  });
});

describe('lintSketch: the result is safe to hand to a caller', () => {
  it('holds an empty sketch without inventing a syntax error', () => {
    const r = lintSketch('');
    expect(rulesOf(r.diagnostics)).toEqual(['no-output']);
  });

  it('never reports a position outside the text', () => {
    for (const code of ['out(sprite(`w`)', 'mirrror(1)', '', 'const a = 1;', ');']) {
      const lines = code.split('\n');
      for (const d of lintSketch(code).diagnostics) {
        expect(d.line, code).toBeGreaterThanOrEqual(1);
        expect(d.line, code).toBeLessThanOrEqual(Math.max(1, lines.length));
        expect(d.column, code).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('is pure: the same code twice gives the same answer', () => {
    const code = 'size(8, 8);\nout(niose(1));';
    expect(lintSketch(code)).toEqual(lintSketch(code));
  });
});

/**
 * The fifth rule, and the only one that exists because of a name the language
 * gained rather than a mistake a person makes.
 *
 * Every name in the language is a PARAMETER of the function a sketch compiles
 * to, so a top-level `const live` is a redeclaration and the sketch does not
 * compile. Until this rule, `collect()` added that declaration to `bindings` and
 * the names loop then skipped it, so declaring a language name actively SILENCED
 * the only check that might have noticed: the sketch linted green in the gutter
 * and through the lint route, then hard-failed at compile the next time anybody
 * opened it.
 */
describe('lintSketch: redeclaring a name the language already binds', () => {
  it('reports a top-level const, at the declaration', () => {
    const r = lintSketch('const live = 1;\nout(empty());');
    expect(rulesOf(r.diagnostics)).toEqual(['redeclared']);
    expect({ line: r.diagnostics[0].line, column: r.diagnostics[0].column }).toEqual({ line: 1, column: 7 });
    expect(r.diagnostics[0].severity).toBe('error');
    expect(r.diagnostics[0].message).toContain('`live`');
    expect(r.ok).toBe(false);
  });

  it('reports a top-level function declaration too', () => {
    const r = lintSketch('function grad() {}\nout(empty());');
    expect(rulesOf(r.diagnostics)).toEqual(['redeclared']);
    expect({ line: r.diagnostics[0].line, column: r.diagnostics[0].column }).toEqual({ line: 1, column: 10 });
  });

  it('reports a name once, at its first declaration', () => {
    const r = lintSketch('const grad = 1;\nlet noise = 2;\nvar grad2 = 3;\nout(empty());');
    expect(rulesOf(r.diagnostics)).toEqual(['redeclared', 'redeclared']);
    expect(r.diagnostics.map((d) => d.line)).toEqual([1, 2]);
  });

  it('says the same thing the compile failure says, so the two never disagree', () => {
    const r = lintSketch('const sprite = 1;\nout(empty());');
    expect(r.diagnostics[0].message).toBe(
      '`sprite` is already part of the language, so a sketch cannot declare it.',
    );
  });

  it.each([
    ['inside a callback body', "out(fn((x, y) => { const live = .5; return live > .2 ? '#fff' : null; }))"],
    ['inside a bare block', '{ const live = 1; }\nout(empty());'],
    ['in a loop head', 'for (let live = 0; live < 2; live++) {}\nout(empty());'],
    ['as a function parameter', 'const f = (live) => live;\nout(empty());'],
    ['as a catch binding', 'try { } catch (live) { }\nout(empty());'],
  ])('stays silent for a declaration %s, which legally shadows the parameter', (_label, code) => {
    expect(rulesOf(lintSketch(code).diagnostics)).not.toContain('redeclared');
  });

  it('stays silent on every sketch that declares nothing the language binds', () => {
    const r = lintSketch('const ship = sprite(`w`);\nconst B = 6;\nout(ship);');
    expect(r.diagnostics).toEqual([]);
  });

  it('never reports one of the language names against itself', () => {
    // A sweep that walked every VariableDefinition without checking the name
    // would report the whole vocabulary on an empty sketch.
    for (const name of SKETCH_VOCABULARY) {
      expect(rulesOf(lintSketch(`out(${name});`).diagnostics), name).not.toContain('redeclared');
    }
  });
});

describe('the redeclared rule, against the shape that made it necessary', () => {
  // Techno Larry, line 10, on coreos-dev and on prod. `pulse` was considered as
  // a DSL name and struck for exactly this: a hard `Identifier 'pulse' has
  // already been declared` on three stored sketches. The rule turns a corpus
  // sweep that had to be done by hand into a check that runs on every keystroke.
  const TECHNO_LARRY = [
    '// robot: snaps to a new pose each beat',
    'size(32, 32); fps(12); cycle(8);',
    '',
    'const B = 6; // frames per beat (120 BPM at 12 fps)',
    '',
    "const bg = checker('#0f0f17', '#12121c', 4);",
    '',
    '// drop wobble: short and shaking on the bass',
    '',
    'const pulse = (t) => Math.exp(-((t % B) / B) * 4);',
    'out(stack(bg, solid(grey(pulse(0) * 255))));',
  ].join('\n');

  // Bio Scan Lab, line 132 in the original, nested inside an arrow body where it
  // legally shadows. A regex sweep for `const pulse` would have mis-flagged it.
  const NESTED = [
    'size(32, 32);',
    'const tile = (t) => {',
    '  const pulse = .5 + .5 * Math.sin(t * Math.PI / 12);',
    '  return solid(grey(pulse * 255));',
    '};',
    'out(tile(0));',
  ].join('\n');

  const report = (code: string, names: readonly string[]): { name: string; at: number }[] => {
    const tree = parseSketch(code);
    expect(tree).not.toBeNull();
    return topLevelRedeclarations(code, tree!, names);
  };

  it('says nothing about either sketch under the language as it stands', () => {
    expect(rulesOf(lintSketch(TECHNO_LARRY).diagnostics)).toEqual([]);
    expect(rulesOf(lintSketch(NESTED).diagnostics)).toEqual([]);
  });

  it('would have found the collision, at the declaring line, had pulse been taken', () => {
    const found = report(TECHNO_LARRY, [...SKETCH_VOCABULARY, 'pulse']);
    expect(found.map((f) => f.name)).toEqual(['pulse']);
    expect(siteOfOffset(TECHNO_LARRY, found[0].at)).toEqual({ line: 10, column: 7 });
  });

  it('would still have left the nested one alone, which is why it compiles not greps', () => {
    expect(report(NESTED, [...SKETCH_VOCABULARY, 'pulse'])).toEqual([]);
  });

  it('misses object destructuring, and that is the deliberate direction to miss in', () => {
    // `const { live } = x` DOES collide at compile. The grammar records that
    // binding as a PropertyName inside an ObjectPattern rather than a
    // VariableDefinition, and treating every pattern key as a binding would
    // report `const { live: mine } = x`, which is legal. A missed report leaves
    // a sketch failing the way it fails today; a false one would be the lint
    // being wrong about working code, which is the one thing it must never be.
    expect(report('const { live } = { live: 1 };\nout(empty());', [...SKETCH_VOCABULARY, 'live'])).toEqual([]);
  });
});

describe('the rule list is copied into the API schema, and may not drift from it', () => {
  const HERE = fileURLToPath(new URL('.', import.meta.url));
  const read = (relative: string): string => readFileSync(join(HERE, relative), 'utf8');

  it('enumerates the same rules in the OpenAPI schema', () => {
    const openapi = JSON.parse(read('../../../openapi.json')) as {
      components: { schemas: { BlitLintDiagnostic: { properties: { rule: { enum: string[] } } } } };
    };
    expect(openapi.components.schemas.BlitLintDiagnostic.properties.rule.enum).toEqual([...LINT_RULES]);
  });
});
