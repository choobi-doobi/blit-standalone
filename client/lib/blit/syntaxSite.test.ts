import { describe, expect, it } from 'vitest';

import { firstSyntaxErrorAt, siteOfOffset, syntaxSite } from './syntaxSite';

describe('siteOfOffset', () => {
  it('counts lines from 1 and columns from 1', () => {
    expect(siteOfOffset('abc', 0)).toEqual({ line: 1, column: 1 });
    expect(siteOfOffset('abc', 2)).toEqual({ line: 1, column: 3 });
  });

  it('starts a new line after each break', () => {
    const code = 'one\ntwo\nthree';
    expect(siteOfOffset(code, code.indexOf('two'))).toEqual({ line: 2, column: 1 });
    expect(siteOfOffset(code, code.indexOf('three') + 2)).toEqual({ line: 3, column: 3 });
  });

  it('clamps an offset outside the document instead of returning nonsense', () => {
    expect(siteOfOffset('abc', -5)).toEqual({ line: 1, column: 1 });
    expect(siteOfOffset('ab\ncd', 999)).toEqual({ line: 2, column: 3 });
  });
});

describe('syntaxSite', () => {
  it('has nothing to say about a sketch that parses', () => {
    expect(syntaxSite('out(sprite(`ww`).scale(2));')).toBeNull();
    expect(syntaxSite('let a = 1;\nout(solid(`#fff`));')).toBeNull();
  });

  it('points at the line a stray token broke', () => {
    const code = 'let a = 1;\nlet b = 2;\nlet c = (;\nout(empty());';
    const site = syntaxSite(code);
    expect(site?.line).toBe(3);
  });

  it('points at the end for the half-typed chain, which is where the cursor is', () => {
    // The commonest live-coding failure by far: mid-keystroke, nothing is wrong
    // yet except that it stops too early.
    const code = 'out(sprite(`\n  ww\n`).scale(';
    const site = syntaxSite(code);
    expect(site).not.toBeNull();
    expect(site?.line).toBe(3);
  });

  it('reports the FIRST break, not a later one', () => {
    const code = 'let a = (;\nlet b = )(;';
    expect(syntaxSite(code)?.line).toBe(1);
  });

  it('finds an offset for broken code and none for sound code', () => {
    expect(firstSyntaxErrorAt('out(empty());')).toBeNull();
    expect(firstSyntaxErrorAt('out(empty(];')).not.toBeNull();
  });
});
