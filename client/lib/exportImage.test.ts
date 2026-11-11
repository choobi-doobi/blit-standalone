import { describe, expect, it } from 'vitest';

import {
  MAX_ANIMATION_PIXELS,
  animationScale,
  fileStem,
  upscaleNearest,
} from './exportImage';

describe('fileStem', () => {
  it('slugifies a sketch name', () => {
    expect(fileStem('My Ship 2')).toBe('my-ship-2');
  });

  it('collapses runs of punctuation and trims the edges', () => {
    expect(fileStem('  --Hello__World!!  ')).toBe('hello-world');
  });

  it('falls back rather than producing an empty filename', () => {
    expect(fileStem('   ')).toBe('sketch');
    expect(fileStem('!!!')).toBe('sketch');
  });
});

describe('animationScale', () => {
  it('uses the zoom you are working at, since natural size is a thumbnail', () => {
    expect(animationScale(8, 32, 32, 8)).toBe(8);
  });

  it('reduces the scale rather than refusing a reasonable export', () => {
    // Zoom multiplies the cost by its SQUARE, so a big sketch at zoom 16 would
    // blow the budget. Shrinking to what fits beats an error nobody can act on.
    const scale = animationScale(64, 128, 128, 16);
    expect(scale).toBeLessThan(16);
    expect(scale).toBeGreaterThanOrEqual(1);
    expect(64 * 128 * 128 * scale * scale).toBeLessThanOrEqual(MAX_ANIMATION_PIXELS);
  });

  it('never scales below natural size', () => {
    expect(animationScale(8, 32, 32, 0)).toBe(1);
    expect(animationScale(8, 32, 32, -4)).toBe(1);
  });

  it('keeps large loops at natural size for streaming encoding', () => {
    expect(animationScale(256, 512, 512, 1)).toBe(1);
    expect(animationScale(256, 512, 512, 16)).toBe(1);
  });

  it('keeps whatever it allows inside the budget', () => {
    for (const [frames, w, h] of [[8, 32, 32], [16, 64, 64], [256, 16, 16], [4, 200, 200]] as const) {
      const scale = animationScale(frames, w, h, 16);
      if (scale === 0) continue;
      expect(frames * w * h * scale * scale).toBeLessThanOrEqual(MAX_ANIMATION_PIXELS);
    }
  });
});

describe('upscaleNearest', () => {
  it('leaves natural size alone, buffer and all', () => {
    const data = new Uint8ClampedArray([1, 2, 3, 4]);
    expect(upscaleNearest(data, 1, 1, 1)).toBe(data);
  });

  it('repeats each pixel into a square block', () => {
    const data = new Uint8ClampedArray([10, 20, 30, 40]);
    const out = upscaleNearest(data, 1, 1, 3);
    expect(out.length).toBe(3 * 3 * 4);
    for (let i = 0; i < 9; i += 1) {
      expect([...out.subarray(i * 4, i * 4 + 4)]).toEqual([10, 20, 30, 40]);
    }
  });

  it('keeps the pixels where they belong in two dimensions', () => {
    // A 2x1 of two different colours doubled: the left half must stay left.
    const data = new Uint8ClampedArray([1, 1, 1, 255, 9, 9, 9, 255]);
    const out = upscaleNearest(data, 2, 1, 2);
    const at = (x: number, y: number) => [...out.subarray((y * 4 + x) * 4, (y * 4 + x) * 4 + 4)];
    expect(at(0, 0)).toEqual([1, 1, 1, 255]);
    expect(at(1, 0)).toEqual([1, 1, 1, 255]);
    expect(at(2, 0)).toEqual([9, 9, 9, 255]);
    expect(at(3, 0)).toEqual([9, 9, 9, 255]);
    expect(at(0, 1)).toEqual([1, 1, 1, 255]);
    expect(at(3, 1)).toEqual([9, 9, 9, 255]);
  });

  it('is exact, never blended', () => {
    // The point of a pixel export. Any averaging between neighbours would show
    // up here as a value that is in neither source pixel.
    const data = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]);
    const out = upscaleNearest(data, 2, 1, 4);
    const values = new Set([...out]);
    expect([...values].sort((a, b) => a - b)).toEqual([0, 255]);
  });

  it('carries alpha through untouched', () => {
    const data = new Uint8ClampedArray([5, 5, 5, 0]);
    expect([...upscaleNearest(data, 1, 1, 2).subarray(0, 4)]).toEqual([5, 5, 5, 0]);
  });
});
