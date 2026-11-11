/**
 * The motion preference decides whether the canvas starts animating on its own.
 *
 * Worth a test because both failure directions are silent. A typo'd query never
 * matches, so the preference is ignored and the sketch animates at someone who
 * asked it not to; a reader that throws on an old browser would take the page
 * down on mount. Neither shows up in a screenshot.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { prefersReducedMotion, REDUCED_MOTION_QUERY } from './useIsMobile';

/** A `matchMedia` that only answers the one query it was told about. */
function matcherFor(query: string, matches: boolean) {
  return (asked: string) => ({ matches: asked === query ? matches : false });
}

const globals = globalThis as unknown as Record<string, unknown>;

afterEach(() => {
  delete globals.window;
});

describe('prefersReducedMotion', () => {
  it('reports the preference when it is set', () => {
    expect(prefersReducedMotion(matcherFor(REDUCED_MOTION_QUERY, true))).toBe(true);
  });

  it('reports no preference as false, so the sketch still animates', () => {
    expect(prefersReducedMotion(matcherFor(REDUCED_MOTION_QUERY, false))).toBe(false);
  });

  it('asks the query the platform actually understands', () => {
    // The guard against a typo: a matcher that answers `true` to ONLY the
    // correct string, and `false` to anything else, cannot be satisfied by a
    // misspelled query. This is the assertion that fails if the constant drifts.
    expect(REDUCED_MOTION_QUERY).toBe('(prefers-reduced-motion: reduce)');
    expect(prefersReducedMotion((asked) => ({ matches: asked === '(prefers-reduced-motion: reduce)' }))).toBe(
      true,
    );
  });

  it('reads window.matchMedia when nothing is injected', () => {
    // The production call site passes no matcher, so the default path needs its
    // own coverage; the injected cases above would all pass with it broken.
    const asked: string[] = [];
    globals.window = {
      matchMedia: (q: string) => {
        asked.push(q);
        return { matches: true };
      },
    };
    expect(prefersReducedMotion()).toBe(true);
    expect(asked).toEqual([REDUCED_MOTION_QUERY]);
  });

  it('says false rather than throwing when there is no matchMedia at all', () => {
    // Server-side rendering, and any environment where the feature is unknown.
    expect(prefersReducedMotion()).toBe(false);
    globals.window = {
      matchMedia: () => {
        throw new Error('unknown feature');
      },
    };
    expect(prefersReducedMotion()).toBe(false);
  });
});
