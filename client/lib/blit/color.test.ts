import { describe, expect, it } from 'vitest';

import {
  alpha,
  blue,
  green,
  grey,
  hsl,
  isVisible,
  luma,
  over,
  parseColor,
  red,
  rgba,
  toCss,
  TRANSPARENT,
} from './color';

describe('packing', () => {
  it('round-trips every channel, including the one that sets the sign bit', () => {
    const c = rgba(255, 128, 7, 200);
    expect([red(c), green(c), blue(c), alpha(c)]).toEqual([255, 128, 7, 200]);
    // 255 << 24 is negative in JavaScript; the pack must land unsigned.
    expect(c).toBeGreaterThan(0);
  });

  it('clamps out-of-range and non-finite channels', () => {
    expect(red(rgba(300, 0, 0))).toBe(255);
    expect(red(rgba(-5, 0, 0))).toBe(0);
    expect(red(rgba(Number.NaN, 0, 0))).toBe(0);
  });

  it('treats alpha 0 as the single transparent value', () => {
    expect(rgba(0, 0, 0, 0)).toBe(TRANSPARENT);
    expect(isVisible(TRANSPARENT)).toBe(false);
    expect(isVisible(rgba(0, 0, 0, 1))).toBe(true);
  });
});

describe('parseColor', () => {
  it('reads every hex length', () => {
    expect(parseColor('#fff')).toBe(rgba(255, 255, 255));
    expect(parseColor('#f00a')).toBe(rgba(255, 0, 0, 170));
    expect(parseColor('#e43b44')).toBe(rgba(0xe4, 0x3b, 0x44));
    expect(parseColor('#e43b4480')).toBe(rgba(0xe4, 0x3b, 0x44, 0x80));
  });

  it('reads names and is case and space insensitive', () => {
    expect(parseColor('  WHITE ')).toBe(rgba(255, 255, 255));
    expect(parseColor('transparent')).toBe(TRANSPARENT);
  });

  it('passes a packed number straight through', () => {
    expect(parseColor(rgba(1, 2, 3, 4))).toBe(rgba(1, 2, 3, 4));
  });

  it('throws rather than silently yielding transparent on a typo', () => {
    expect(() => parseColor('#gggggg')).toThrow(/Not a color/);
    expect(() => parseColor('ffffff')).toThrow(/Not a color/);
  });
});

describe('over', () => {
  it('lets an opaque top win and a transparent top vanish', () => {
    const top = rgba(255, 0, 0);
    const bottom = rgba(0, 0, 255);
    expect(over(top, bottom)).toBe(top);
    expect(over(TRANSPARENT, bottom)).toBe(bottom);
  });

  it('blends a half-transparent top, which is what makes a soft shadow read', () => {
    const result = over(rgba(0, 0, 0, 128), rgba(255, 255, 255, 255));
    expect(alpha(result)).toBe(255);
    // Halfway between black and white, give or take the rounding.
    expect(red(result)).toBeGreaterThan(120);
    expect(red(result)).toBeLessThan(136);
  });

  it('keeps a translucent top over nothing translucent', () => {
    const result = over(rgba(10, 20, 30, 100), TRANSPARENT);
    expect(alpha(result)).toBe(100);
    expect(red(result)).toBe(10);
  });
});

describe('helpers', () => {
  it('builds greys and reports luminance in channel order', () => {
    expect(grey(80)).toBe(rgba(80, 80, 80));
    expect(luma(rgba(255, 255, 255))).toBeCloseTo(255, 0);
    expect(luma(rgba(0, 0, 0))).toBe(0);
    // Green is weighted most heavily, red next, blue least.
    expect(luma(rgba(0, 255, 0))).toBeGreaterThan(luma(rgba(255, 0, 0)));
    expect(luma(rgba(255, 0, 0))).toBeGreaterThan(luma(rgba(0, 0, 255)));
  });

  it('converts hsl, including the achromatic shortcut', () => {
    expect(hsl(0, 1, 0.5)).toBe(rgba(255, 0, 0));
    expect(hsl(120, 1, 0.5)).toBe(rgba(0, 255, 0));
    expect(hsl(240, 1, 0.5)).toBe(rgba(0, 0, 255));
    expect(hsl(999, 0, 0.5)).toBe(grey(127.5));
    // Hue wraps rather than clamping.
    expect(hsl(360, 1, 0.5)).toBe(hsl(0, 1, 0.5));
  });

  it('prints hex, adding the alpha pair only when it is needed', () => {
    expect(toCss(rgba(0xe4, 0x3b, 0x44))).toBe('#e43b44');
    expect(toCss(rgba(0, 0, 0, 0x80))).toBe('#00000080');
  });
});
