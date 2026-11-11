import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ZOOM,
  MAX_CANVAS_PIXELS,
  ZOOMS,
  backingScale,
  isZoom,
  normalizeZoom,
  recentre,
} from './zoom';

describe('zoom', () => {
  it('opens at 2x, and that is one of the steps on offer', () => {
    // Pinned rather than assumed: the migration's column default says 2 as well,
    // and `routes/sketches.integration.test.ts` holds the two to each other.
    expect(DEFAULT_ZOOM).toBe(2);
    expect(ZOOMS).toContain(DEFAULT_ZOOM);
  });

  it('recognises exactly the steps the editor offers', () => {
    for (const z of ZOOMS) expect(isZoom(z)).toBe(true);
    // Between two steps, past the last one, and not a number at all.
    for (const z of [0, 3, 5, 17, 32, -8, 2.5, '8', null, undefined, NaN]) {
      expect(isZoom(z), `${String(z)} is not a zoom step`).toBe(false);
    }
  });

  it('falls back to the default for a stored value that is not a step', () => {
    // A row written before the column existed reads as null, and an API caller
    // is not the editor. Neither is a reason for the canvas to render at NaN.
    expect(normalizeZoom(null)).toBe(DEFAULT_ZOOM);
    expect(normalizeZoom(undefined)).toBe(DEFAULT_ZOOM);
    expect(normalizeZoom(5)).toBe(DEFAULT_ZOOM);
    expect(normalizeZoom('16')).toBe(DEFAULT_ZOOM);
  });

  it('keeps a stored step exactly as it was saved', () => {
    for (const z of ZOOMS) expect(normalizeZoom(z)).toBe(z);
  });
});

describe('backingScale', () => {
  it('gives every device pixel its own backing pixel when there is room', () => {
    expect(backingScale(16, 16, 8, 1)).toBe(8);
    expect(backingScale(16, 16, 8, 2)).toBe(16);
    // A fractional ratio is a real thing browsers report, and it is not rounded:
    // rounding it is how a retina canvas ends up a hair soft.
    expect(backingScale(32, 32, 4, 1.5)).toBe(6);
  });

  it('stays inside the budget on the canvases that would otherwise come back blank', () => {
    // 512 at 16x on a retina screen is 16384 square: over a billion pixels, which
    // is past what a browser will allocate at all.
    for (const zoom of ZOOMS) {
      for (const dpr of [1, 1.25, 2, 3]) {
        const scale = backingScale(512, 512, zoom, dpr);
        expect(512 * scale * (512 * scale), `${zoom}x at dpr ${dpr}`).toBeLessThanOrEqual(
          MAX_CANVAS_PIXELS,
        );
        expect(scale).toBeGreaterThan(0);
        expect(scale).toBeLessThanOrEqual(zoom * dpr);
      }
    }
  });

  it('falls back to a whole division of the zoom, so pixels stay the same size', () => {
    // 512 square at 16x is 67M pixels at one backing pixel each, so it halves to
    // 8 rather than landing on the 7.9 the raw budget would allow: the browser
    // then upscales by exactly 2 and every sketch pixel is the same block.
    const scale = backingScale(512, 512, 16, 2);
    expect(scale).toBe(8);
    expect(16 % scale).toBe(0);
  });

  it('draws a canvas no size() can ask for small rather than not at all', () => {
    const scale = backingScale(20_000, 20_000, 16, 1);
    expect(scale).toBeGreaterThan(0);
    expect(20_000 * scale * (20_000 * scale)).toBeLessThanOrEqual(MAX_CANVAS_PIXELS);
  });
});

describe('recentre', () => {
  it('keeps a picture that fits centred, which is no scroll at all', () => {
    expect(recentre({ scroll: 0, port: 400, before: 32, after: 128, pad: 16 })).toBe(0);
  });

  it('zooms about the middle of the view rather than the top-left corner', () => {
    // 200 wide, looking at the middle of a 400-wide picture: scrolled 116 with
    // 16 of padding at each end. Doubling the picture has to double the distance
    // from its centre, not leave the view where it was.
    const port = 200;
    const pad = 16;
    const before = 400;
    const at = recentre({ scroll: 116, port, before, after: before, pad });
    expect(at).toBe(116);
    // Dead centre stays dead centre.
    const centred = (before + pad * 2 - port) / 2;
    expect(recentre({ scroll: centred, port, before, after: 800, pad })).toBe(
      (800 + pad * 2 - port) / 2,
    );
  });

  it('carries an off-centre view across the zoom', () => {
    const port = 200;
    const pad = 0;
    // 300 from the left of a 400 picture is 100 right of its centre; the view's
    // own centre is therefore 100 past the picture's.
    const at = recentre({ scroll: 200, port, before: 400, after: 800, pad });
    // Doubled, the same point is 200 right of centre: 400 + 200 - 100.
    expect(at).toBe(500);
  });

  it('never asks for a scroll the port cannot hold', () => {
    // Zooming out from the far edge: the answer is the new maximum, not a
    // position past the end that the browser would silently clamp anyway.
    expect(recentre({ scroll: 600, port: 200, before: 800, after: 300, pad: 0 })).toBe(100);
    expect(recentre({ scroll: 600, port: 200, before: 800, after: 100, pad: 0 })).toBe(0);
  });
});
