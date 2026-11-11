/**
 * Where a sketch stopped being valid JavaScript.
 *
 * A `new Function` SyntaxError carries no position at all (see `errorSite.ts`),
 * so the compile phase has to get one from a parser rather than from the engine.
 * It asks the Lezer JavaScript grammar, which is the SAME grammar CodeMirror is
 * already running to highlight the buffer. That matters twice over: it is free,
 * being already in the bundle and already parsing this text, and it cannot
 * disagree with what the editor thinks the code is.
 *
 * Lezer is error-tolerant, so it always returns a tree and marks the places it
 * could not continue as error nodes. The FIRST of those is the honest answer to
 * "where should I look", and for the commonest live-coding case — a half-typed
 * chain — it lands at the end of the buffer, which is exactly where the cursor
 * is.
 *
 * Parsed on the ORIGINAL buffer, never the rewritten one. The evaluator rewrites
 * `sprite(` into `__spriteAt(<id>, ` before compiling, which keeps every line
 * intact but moves columns along the lines it touches. Lines are what the gutter
 * needs and they survive; columns would be quietly wrong.
 */

import { parser } from '@lezer/javascript';
import type { Tree } from '@lezer/common';

import type { Site } from './errorSite';

/**
 * The first offset in an already-parsed tree that the grammar could not continue
 * at, if any.
 *
 * Split out from `firstSyntaxErrorAt` so `lint.ts` can parse the buffer ONCE and
 * still get byte-identical positions: the lint walks the same tree afterwards for
 * names, and a second parse would be both wasted work and a second opinion.
 */
export function firstErrorOffset(tree: Tree): number | null {
  let found: number | null = null;
  tree.iterate({
    enter: (node) => {
      if (found !== null) return false;
      if (node.type.isError) {
        found = node.from;
        return false;
      }
      return true;
    },
  });
  return found;
}

/** Parse a sketch. Returns null only if the parser itself gave up. */
export function parseSketch(code: string): Tree | null {
  try {
    return parser.parse(code);
  } catch {
    // A parser that itself throws is not a reason to lose the error message the
    // caller already has.
    return null;
  }
}

/** The first document offset the grammar could not continue at, if any. */
export function firstSyntaxErrorAt(code: string): number | null {
  const tree = parseSketch(code);
  return tree === null ? null : firstErrorOffset(tree);
}

/** The 1-based line and column of a document offset. */
export function siteOfOffset(code: string, offset: number): Site {
  const clamped = Math.max(0, Math.min(code.length, offset));
  const before = code.slice(0, clamped);
  const line = before.split('\n').length;
  const lastBreak = before.lastIndexOf('\n');
  return { line, column: clamped - lastBreak };
}

/**
 * Every offset at which the sketch declares `name`, in source order.
 *
 * For an error the ENGINE reported but the grammar is happy with — a sketch that
 * declares a name the language already binds parses perfectly well on its own —
 * this is the only way to put a line number on it. `VariableDefinition` covers
 * `const`, `let`, `var`, a function and a class alike, which is why the walk
 * looks for one node type rather than five.
 */
export function declarationsOf(code: string, name: string): number[] {
  const tree = parseSketch(code);
  if (tree === null) return [];

  const found: number[] = [];
  tree.iterate({
    enter: (node) => {
      if (node.name === 'VariableDefinition' && code.slice(node.from, node.to) === name) {
        found.push(node.from);
      }
      return true;
    },
  });
  return found;
}

/** Where to point at for a sketch that did not parse, or null if the grammar is happy with it. */
export function syntaxSite(code: string): Site | null {
  const at = firstSyntaxErrorAt(code);
  return at === null ? null : siteOfOffset(code, at);
}
