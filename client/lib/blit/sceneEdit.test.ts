import { describe, expect, it } from 'vitest';

import { blitCallText, callRange, insertBlit, isMovable, moveBlitCall, movableCalls, refLiteral } from './sceneEdit';
import { scanSpriteLiterals } from './source';

/** The `(` of the nth `blit(` call, as the scanner finds it. */
const openOf = (code: string, n = 0): number => scanSpriteLiterals(code).blits[n].open;

describe('moving a placed sketch rewrites its numbers', () => {
  it('replaces both coordinates, keeping everything around them', () => {
    const code = "out(scene(bg, blit('Coin', 3, 4), blit('Gem', 1, 1)))";
    expect(moveBlitCall(code, openOf(code), 40, -2)).toBe("out(scene(bg, blit('Coin', 40, -2), blit('Gem', 1, 1)))");
    expect(moveBlitCall(code, openOf(code, 1), 7, 8)).toBe("out(scene(bg, blit('Coin', 3, 4), blit('Gem', 7, 8)))");
  });

  it('adds a position to a call that has none', () => {
    const code = "out(blit('Coin'))";
    expect(moveBlitCall(code, openOf(code), 5, 6)).toBe("out(blit('Coin', 5, 6))");
  });

  it('adds the missing y', () => {
    const code = "out(blit('Coin', 2))";
    expect(moveBlitCall(code, openOf(code), 5, 6)).toBe("out(blit('Coin', 5, 6))");
  });

  it('keeps its hands off a position the sketch computes', () => {
    const code = "out(blit('Coin', i * 16, 0))";
    expect(isMovable(code, openOf(code))).toBe(false);
    expect(moveBlitCall(code, openOf(code), 5, 6)).toBeNull();
  });

  it('treats a negative literal as a number, and a call split over lines the same', () => {
    const code = "out(blit(\n  'Coin',\n  -3,\n  12,\n))";
    expect(isMovable(code, openOf(code))).toBe(true);
    expect(moveBlitCall(code, openOf(code), 1, 2)).toBe("out(blit(\n  'Coin',\n  1,\n  2,\n))");
  });

  it('answers movability for many calls from one parse', () => {
    const code = "scene(blit('A', 1, 1), blit('B', x, 1), blit('C'))";
    const calls = scanSpriteLiterals(code).blits;
    expect([...movableCalls(code, calls)]).toEqual([0, 2]);
  });

  it('finds the whole call, for selecting it in the editor', () => {
    const code = "out(blit('Coin', 3, 4))";
    const call = scanSpriteLiterals(code).blits[0];
    const range = callRange(code, call.start, call.open)!;
    expect(code.slice(range.from, range.to)).toBe("blit('Coin', 3, 4)");
  });
});

describe('placing a sketch adds a call', () => {
  const text = blitCallText('Coin', 4, 5);

  /** The inserted call is where `at` says. */
  const landed = (result: ReturnType<typeof insertBlit>) => {
    expect(result).not.toBeNull();
    expect(result!.code.slice(result!.at, result!.at + text.length)).toBe(text);
    return result!.code;
  };

  it('appends to a scene() over several lines, in its layout', () => {
    const code = "size(64, 64);\nout(scene(\n  checker(),\n  blit('Gem', 1, 1),\n));\n";
    expect(landed(insertBlit(code, text))).toBe(
      "size(64, 64);\nout(scene(\n  checker(),\n  blit('Gem', 1, 1),\n  blit('Coin', 4, 5),\n));\n",
    );
  });

  it('appends to a scene() over several lines with no trailing comma', () => {
    const code = "out(scene(\n  checker(),\n  blit('Gem', 1, 1)\n))";
    expect(landed(insertBlit(code, text))).toBe("out(scene(\n  checker(),\n  blit('Gem', 1, 1),\n  blit('Coin', 4, 5)\n))");
  });

  it('appends to a scene() on one line', () => {
    expect(landed(insertBlit('out(scene(checker()))', text))).toBe("out(scene(checker(), blit('Coin', 4, 5)))");
  });

  it('fills an empty scene()', () => {
    expect(landed(insertBlit('out(scene())', text))).toBe("out(scene(\n  blit('Coin', 4, 5),\n))");
  });

  it('wraps what out() draws when there is no scene yet', () => {
    const code = 'size(32, 32);\nout(sprite(`\n  ww\n`).center());\n';
    expect(landed(insertBlit(code, text))).toBe(
      "size(32, 32);\nout(scene(\n  sprite(`\n  ww\n`).center(),\n  blit('Coin', 4, 5),\n));\n",
    );
  });

  it('wraps a sketch that is one bare expression', () => {
    expect(landed(insertBlit('checker()', text))).toBe("scene(\n  checker(),\n  blit('Coin', 4, 5),\n)");
  });

  it('wraps what a sketch returns', () => {
    expect(landed(insertBlit('const a = checker();\nreturn a;', text))).toBe(
      "const a = checker();\nreturn scene(\n  a,\n  blit('Coin', 4, 5),\n);",
    );
  });

  it('declines when it cannot tell which output is meant', () => {
    expect(insertBlit("out(a);\nout(b);", text)).toBeNull();
    expect(insertBlit("size(8);", text)).toBeNull();
  });

  it('writes the reference as a literal that survives any name', () => {
    expect(refLiteral("Bob's \\ coin")).toBe("'Bob\\'s \\\\ coin'");
    expect(refLiteral(12)).toBe('12');
  });
});
