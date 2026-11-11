// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';

import {
  DEFAULT_SHARES,
  MAX_SHARE,
  MIN_SHARE,
  clampShare,
  isLayout,
  readWorkbench,
  useWorkbench,
} from './workbench';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('clampShare', () => {
  it('keeps a pane from being dragged away to nothing', () => {
    expect(clampShare(0.5)).toBe(0.5);
    expect(clampShare(0)).toBe(MIN_SHARE);
    expect(clampShare(1)).toBe(MAX_SHARE);
    expect(clampShare(-4)).toBe(MIN_SHARE);
  });

  it('rounds to a thousandth, so a drag never stores a pixel of float noise', () => {
    expect(clampShare(0.3333333)).toBe(0.333);
  });

  it('falls back rather than storing NaN', () => {
    expect(clampShare(Number.NaN)).toBe(DEFAULT_SHARES.stacked);
  });
});

describe('what was remembered', () => {
  it('starts stacked at the 2:3 the card had before it was adjustable', () => {
    expect(readWorkbench(null)).toEqual({ layout: 'stacked', shares: { stacked: 0.4, columns: 0.5 } });
  });

  it('ignores a value that is not one of the arrangements', () => {
    expect(readWorkbench('{"layout":"diagonal"}').layout).toBe('stacked');
    expect(isLayout('diagonal')).toBe(false);
  });

  it('clamps a share that was stored out of range, rather than trusting it', () => {
    expect(readWorkbench('{"shares":{"stacked":0.99,"columns":-1}}').shares).toEqual({
      stacked: MAX_SHARE,
      columns: MIN_SHARE,
    });
  });

  it('survives text that is not JSON at all', () => {
    expect(readWorkbench('}{')).toEqual({ layout: 'stacked', shares: { stacked: 0.4, columns: 0.5 } });
  });
});

describe('useWorkbench', () => {
  it('sizes the arrangement you are in, and leaves the other one alone', () => {
    const { result } = renderHook(() => useWorkbench());

    act(() => result.current.setShare(0.7));
    expect(result.current.share).toBe(0.7);

    act(() => result.current.setLayout('columns'));
    // The whole reason each arrangement keeps its own: switching is not resizing.
    expect(result.current.share).toBe(DEFAULT_SHARES.columns);

    act(() => result.current.setLayout('stacked'));
    expect(result.current.share).toBe(0.7);
  });

  it('resets the arrangement you are in to its default', () => {
    const { result } = renderHook(() => useWorkbench());
    act(() => result.current.setShare(0.8));
    act(() => result.current.reset());
    expect(result.current.share).toBe(DEFAULT_SHARES.stacked);
  });

  it('remembers both across a remount', () => {
    const first = renderHook(() => useWorkbench());
    act(() => first.result.current.setShare(0.25));
    act(() => first.result.current.setLayout('columns'));
    act(() => first.result.current.setShare(0.65));
    first.unmount();

    const second = renderHook(() => useWorkbench());
    expect(second.result.current.layout).toBe('columns');
    expect(second.result.current.share).toBe(0.65);
    act(() => second.result.current.setLayout('stacked'));
    expect(second.result.current.share).toBe(0.25);
  });

  it('still works when localStorage refuses, because a private window is not an error', () => {
    const store = window.localStorage;
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => {
          throw new Error('denied');
        },
        setItem: () => {
          throw new Error('denied');
        },
      },
    });
    try {
      const { result } = renderHook(() => useWorkbench());
      expect(result.current.share).toBe(DEFAULT_SHARES.stacked);
      act(() => result.current.setShare(0.6));
      expect(result.current.share).toBe(0.6);
    } finally {
      Object.defineProperty(window, 'localStorage', { configurable: true, value: store });
    }
  });
});
