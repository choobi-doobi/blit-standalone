import { describe, expect, it } from 'vitest';

import { importRgba } from './importImage';
import {
  DOWNSCALE_PRESETS,
  downscaleOptions,
  fitted,
  naturalSide,
  paletteSize,
  resampleNearest,
} from './resample';

/** An RGBA buffer from `[r,g,b,a]` rows, so a fixture reads like a picture. */
function rgbaOf(pixels: number[][]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(pixels.length * 4);
  pixels.forEach((p, i) => out.set(p, i * 4));
  return out;
}

/** Nearest-neighbour upscale by a whole number: what a sprite saved at 16x looks like. */
function upscale(data: Uint8ClampedArray, w: number, h: number, k: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * k * h * k * 4);
  for (let y = 0; y < h * k; y += 1) {
    for (let x = 0; x < w * k; x += 1) {
      const si = (Math.floor(y / k) * w + Math.floor(x / k)) * 4;
      out.set(data.subarray(si, si + 4), (y * w * k + x) * 4);
    }
  }
  return out;
}

const SPRITE_2x2 = rgbaOf([
  [255, 0, 0, 255],
  [0, 255, 0, 255],
  [0, 0, 255, 128],
  [0, 0, 0, 0],
]);

describe('fitted', () => {
  it('caps the longest side and keeps the aspect ratio', () => {
    expect(fitted(800, 600, 64)).toEqual({ width: 64, height: 48 });
    expect(fitted(600, 800, 64)).toEqual({ width: 48, height: 64 });
    expect(fitted(512, 512, 32)).toEqual({ width: 32, height: 32 });
  });

  it('gives the governing side exactly the size asked for, with no float drift', () => {
    for (const w of [3, 7, 99, 333, 1000, 1024]) {
      expect(fitted(w, 2, 128).width).toBe(w > 128 ? 128 : w);
    }
  });

  it('never rounds a side away to nothing', () => {
    expect(fitted(1000, 3, 16)).toEqual({ width: 16, height: 1 });
  });

  it('is the image itself when the size asked for is not smaller', () => {
    expect(fitted(40, 30, 128)).toEqual({ width: 40, height: 30 });
    expect(fitted(40, 30, 40)).toEqual({ width: 40, height: 30 });
  });
});

describe('resampleNearest', () => {
  it('recovers a whole-number upscale byte for byte', () => {
    for (const k of [2, 3, 8, 16]) {
      const big = upscale(SPRITE_2x2, 2, 2, k);
      expect(Array.from(resampleNearest(big, 2 * k, 2 * k, 2, 2))).toEqual(Array.from(SPRITE_2x2));
    }
  });

  it('samples the centre of each destination pixel, not its corner', () => {
    // A 4x1 ramp down to 2x1: centre sampling takes pixels 1 and 3, corner
    // sampling would take 0 and 2. The difference is a half-pixel shift across
    // every import, so it is worth pinning.
    const ramp = rgbaOf([
      [10, 10, 10, 255],
      [20, 20, 20, 255],
      [30, 30, 30, 255],
      [40, 40, 40, 255],
    ]);
    const small = resampleNearest(ramp, 4, 1, 2, 1);
    expect([small[0], small[4]]).toEqual([20, 40]);
  });

  it('invents no colour: every pixel out is a pixel that was in', () => {
    const noisy = new Uint8ClampedArray(64 * 64 * 4);
    for (let i = 0; i < noisy.length; i += 4) {
      noisy[i] = (i * 7) % 256;
      noisy[i + 1] = (i * 13) % 256;
      noisy[i + 2] = (i * 29) % 256;
      noisy[i + 3] = 255;
    }
    const source = new Set<string>();
    for (let i = 0; i < noisy.length; i += 4) source.add(noisy.slice(i, i + 4).join(','));
    const small = resampleNearest(noisy, 64, 64, 17, 17);
    for (let i = 0; i < small.length; i += 4) {
      expect(source.has(small.slice(i, i + 4).join(','))).toBe(true);
    }
  });
});

describe('paletteSize', () => {
  it('counts distinct visible colours', () => {
    expect(paletteSize(SPRITE_2x2, 2, 2)).toBe(3);
  });

  it('does not count transparency, whatever a decoder left in its channels', () => {
    const ghosts = rgbaOf([
      [255, 0, 0, 0],
      [0, 255, 0, 0],
      [9, 9, 9, 0],
      [1, 2, 3, 255],
    ]);
    expect(paletteSize(ghosts, 2, 2)).toBe(1);
  });
});

describe('naturalSide', () => {
  it('finds the size a whole-number upscale came from', () => {
    expect(naturalSide(upscale(SPRITE_2x2, 2, 2, 16), 32, 32)).toBe(2);
    expect(naturalSide(upscale(SPRITE_2x2, 2, 2, 3), 6, 6)).toBe(2);
  });

  it('reports the LONGEST side, so it can be asked for as a size', () => {
    const wide = rgbaOf([
      [1, 1, 1, 255],
      [2, 2, 2, 255],
      [3, 3, 3, 255],
      [4, 4, 4, 255],
      [5, 5, 5, 255],
      [6, 6, 6, 255],
    ]);
    // 3x2 upscaled 4x -> 12x8. The natural size is 3x2, longest side 3.
    expect(naturalSide(upscale(wide, 3, 2, 4), 12, 8)).toBe(3);
  });

  it('is null when nothing can be removed losslessly', () => {
    expect(naturalSide(SPRITE_2x2, 2, 2)).toBeNull();
    const nearly = upscale(SPRITE_2x2, 2, 2, 4);
    nearly[nearly.length - 1] = 7; // one pixel of one block disagrees
    expect(naturalSide(nearly, 8, 8)).toBeNull();
  });

  it('is 1 for a flat image, because a flat image IS one pixel scaled up', () => {
    const flat = new Uint8ClampedArray(16 * 16 * 4).fill(255);
    expect(naturalSide(flat, 16, 16)).toBe(1);
  });

  it('ignores the channels of transparent pixels when deciding a block is uniform', () => {
    const blank = new Uint8ClampedArray(8 * 8 * 4);
    for (let i = 0; i < blank.length; i += 4) blank[i] = i % 256; // junk R, alpha 0
    expect(naturalSide(blank, 8, 8)).toBe(1);
  });
});

describe('downscaleOptions', () => {
  const big = upscale(SPRITE_2x2, 2, 2, 256); // 512x512, really a 2x2

  it('offers every preset below the image, and never an upscale', () => {
    const sizes = downscaleOptions(big, 512, 512).map((o) => o.size);
    for (const preset of DOWNSCALE_PRESETS) expect(sizes).toContain(preset);
    expect(Math.max(...sizes)).toBeLessThan(512);
  });

  it('offers the natural size and marks it as the one that loses nothing', () => {
    const options = downscaleOptions(big, 512, 512);
    const exact = options.filter((o) => o.exact);
    expect(exact).toHaveLength(1);
    expect(exact[0]).toMatchObject({ size: 2, width: 2, height: 2, colors: 3, fits: true });
  });

  it('is sorted smallest first, so the cheapest grid reads first', () => {
    const sizes = downscaleOptions(big, 512, 512).map((o) => o.size);
    expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
  });

  it('reports the real grid for a non-square image', () => {
    const wide = upscale(SPRITE_2x2, 2, 2, 128); // 256x256
    const options = downscaleOptions(wide.subarray(0, 256 * 128 * 4), 256, 128);
    expect(options.find((o) => o.size === 64)).toMatchObject({ width: 64, height: 32 });
  });

  it('says which sizes a grid could not name, rather than leaving it to be found out', () => {
    // 400 distinct colours across 400 pixels, then upscaled: no downscale gets
    // this under the 35-colour cap, and every option has to say so.
    const many = new Uint8ClampedArray(400 * 4);
    for (let i = 0; i < 400; i += 1) {
      many[i * 4] = i % 256;
      many[i * 4 + 1] = (i * 3) % 256;
      many[i * 4 + 2] = 255 - (i % 256);
      many[i * 4 + 3] = 255;
    }
    const options = downscaleOptions(upscale(many, 20, 20, 16), 320, 320);
    expect(options.length).toBeGreaterThan(0);
    expect(options.every((o) => !o.fits)).toBe(true);
    expect(options.every((o) => o.colors > 35)).toBe(true);
  });
});

describe('the round trip a downscale exists for', () => {
  it('imports a 16x-upscaled sprite back to the grid it was drawn as', () => {
    const drawn = importRgba(SPRITE_2x2, 2, 2);
    expect(drawn.ok).toBe(true);

    const big = upscale(SPRITE_2x2, 2, 2, 16); // 32x32, the way art gets shared
    const natural = naturalSide(big, 32, 32);
    expect(natural).toBe(2);
    const { width, height } = fitted(32, 32, natural!);
    const back = importRgba(resampleNearest(big, 32, 32, width, height), width, height);

    expect(back.ok).toBe(true);
    if (!back.ok || !drawn.ok) return;
    expect(back.sprite.rows).toEqual(drawn.sprite.rows);
    expect(back.sprite.bindings).toEqual(drawn.sprite.bindings);
  });
});
