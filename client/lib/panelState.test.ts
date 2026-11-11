import { describe, expect, it } from 'vitest';

import { clampWidth, MAX_PANEL, MIN_PANEL } from './panelState';

describe('clampWidth', () => {
  it('keeps a width inside the range the design system allows', () => {
    expect(clampWidth(280)).toBe(280);
    expect(clampWidth(10)).toBe(MIN_PANEL);
    expect(clampWidth(9999)).toBe(MAX_PANEL);
  });

  it('rounds, so a drag never stores a fractional pixel width', () => {
    expect(clampWidth(280.6)).toBe(281);
  });

  it('falls back on a non-finite width rather than storing NaN', () => {
    expect(clampWidth(Number.NaN)).toBe(MIN_PANEL);
  });
});
