import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PROLOGUE,
  expressionBody,
  rawStackSite,
  resetWrapperOffset,
  siteFromError,
  statementBody,
  wrapperOffset,
} from './errorSite';

beforeEach(resetWrapperOffset);

/** An engine that reports `line` for whatever it was asked to compile. */
function fakeEngine(line: number | null) {
  return (_body: string) => () => {
    const error = new Error('probe');
    error.stack = line === null ? 'Error: probe\n    at nowhere' : `Error: probe\n    at eval (<anonymous>:${line}:9)`;
    throw error;
  };
}

describe('the compiled bodies', () => {
  it('puts the sketch on the line the prologue count says it does', () => {
    // Derived, not written down: the count and the body that produces it cannot
    // drift apart, so editing `expressionBody` can never silently shift every
    // reported line by one.
    const expr = expressionBody('SKETCH').split('\n');
    expect(expr[PROLOGUE.expression]).toBe('SKETCH');
    const stmt = statementBody('SKETCH').split('\n');
    expect(stmt[PROLOGUE.statement]).toBe('SKETCH');
  });

  it('opens both forms with the strict directive, as the FIRST statement', () => {
    // A directive is only a directive in first position, so this is what stops a
    // typo becoming a silent write to `window`.
    expect(expressionBody('x').startsWith("'use strict';")).toBe(true);
    expect(statementBody('x').startsWith("'use strict';")).toBe(true);
  });

  it('keeps a trailing line comment from swallowing the closing paren', () => {
    expect(expressionBody('sprite(`ww`) // done')).toContain('// done\n)');
  });
});

describe('rawStackSite', () => {
  it('reads the position out of a V8 stack', () => {
    expect(rawStackSite('Error: x\n    at eval (<anonymous>:6:7)')).toEqual({ line: 6, column: 7 });
  });

  it('takes the first frame, which is the sketch and not what called it', () => {
    // A throw inside a user callback has the sketch's frame on top and Blit's
    // rendering frames underneath.
    const stack = 'Error: x\n    at eval (<anonymous>:5:20)\n    at at (<anonymous>:99:1)';
    expect(rawStackSite(stack)?.line).toBe(5);
  });

  it('is not fooled by the `eval at <anonymous>` that precedes the real position', () => {
    // V8 says `<anonymous>` twice on one line; only one of them is a position.
    const stack = 'Error: x\n    at eval (eval at go (file.js:22:52), <anonymous>:6:7)';
    expect(rawStackSite(stack)).toEqual({ line: 6, column: 7 });
  });

  it('has nothing to report when the stack has no position in it', () => {
    // This is the SyntaxError case, measured rather than assumed: V8 gives a
    // `new Function` parse failure a stack pointing at the CALLER.
    expect(rawStackSite('SyntaxError: Unexpected token\n    at new Function (<anonymous>)')).toBeNull();
    expect(rawStackSite(undefined)).toBeNull();
    expect(rawStackSite(null)).toBeNull();
    expect(rawStackSite(42)).toBeNull();
  });
});

describe('wrapperOffset', () => {
  it('measures the engine rather than assuming a shape', () => {
    // The probe throws on the sketch's first line. An engine that calls that
    // line 4 is adding 4 - (prologue + 1) lines of its own wrapper.
    expect(wrapperOffset(fakeEngine(4))).toBe(4 - (PROLOGUE.statement + 1));
    resetWrapperOffset();
    expect(wrapperOffset(fakeEngine(9))).toBe(9 - (PROLOGUE.statement + 1));
  });

  it('measures the real engine as a non-negative number of lines', () => {
    const offset = wrapperOffset();
    expect(offset).not.toBeNull();
    expect(offset).toBeGreaterThanOrEqual(0);
  });

  it('gives up rather than guessing when the engine reports no position', () => {
    expect(wrapperOffset(fakeEngine(null))).toBeNull();
  });

  it('gives up when the probe does not throw at all', () => {
    expect(wrapperOffset(() => () => undefined)).toBeNull();
  });

  it('refuses a measurement that would put the sketch before the body starts', () => {
    expect(wrapperOffset(fakeEngine(0))).toBeNull();
  });

  it('measures once and reuses it, since it cannot change under us', () => {
    const compile = vi.fn(fakeEngine(4));
    wrapperOffset(compile);
    wrapperOffset(compile);
    wrapperOffset(compile);
    expect(compile).toHaveBeenCalledTimes(1);
  });
});

describe('siteFromError', () => {
  const thrownAt = (line: number): Error => {
    const error = new Error('boom');
    error.stack = `Error: boom\n    at eval (<anonymous>:${line}:11)`;
    return error;
  };

  it('subtracts the wrapper and the prologue to land on the sketch line', () => {
    const compile = fakeEngine(4);
    const offset = 4 - (PROLOGUE.statement + 1);
    // Sketch line 3, statement form.
    const raw = offset + PROLOGUE.statement + 3;
    expect(siteFromError(thrownAt(raw), 'statement', compile)).toEqual({ line: 3, column: 11 });
  });

  it('applies the right prologue for each form, which differ', () => {
    const compile = fakeEngine(4);
    const offset = 4 - (PROLOGUE.statement + 1);
    // The SAME raw line means different sketch lines in the two forms, which is
    // exactly the bug this arithmetic exists to avoid.
    const raw = offset + PROLOGUE.expression + 2;
    expect(siteFromError(thrownAt(raw), 'expression', compile)?.line).toBe(2);
    expect(siteFromError(thrownAt(raw), 'statement', compile)?.line).toBe(
      2 + PROLOGUE.expression - PROLOGUE.statement,
    );
    expect(PROLOGUE.expression).not.toBe(PROLOGUE.statement);
  });

  it('reports nothing rather than a line that cannot be real', () => {
    // A line inside the wrapper belongs to code the user never wrote, so a
    // gutter marker for it would point at innocent text.
    expect(siteFromError(thrownAt(1), 'expression', fakeEngine(4))).toBeNull();
  });

  it('reports nothing when the engine gave no position', () => {
    expect(siteFromError(new Error('no stack at all'), 'statement', fakeEngine(4))).not.toBeUndefined();
    const bare = new Error('bare');
    bare.stack = 'Error: bare\n    at new Function (<anonymous>)';
    expect(siteFromError(bare, 'statement', fakeEngine(4))).toBeNull();
    expect(siteFromError('not an error', 'statement', fakeEngine(4))).toBeNull();
  });

  it('keeps the column, floored at 1', () => {
    const compile = fakeEngine(4);
    const offset = 4 - (PROLOGUE.statement + 1);
    const error = new Error('boom');
    error.stack = `Error: boom\n    at eval (<anonymous>:${offset + PROLOGUE.statement + 1}:0)`;
    expect(siteFromError(error, 'statement', compile)?.column).toBe(1);
  });
});
