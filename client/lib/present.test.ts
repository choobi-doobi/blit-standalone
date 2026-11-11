/**
 * The presenter, against fakes, in the node environment.
 *
 * Everything asserted here is a property the CALLERS depend on and neither of
 * them can check for itself: the editor draws inside a rAF callback and cannot
 * see how many canvases it allocated, and a headless host has no 2D context at
 * all. Each one is the difference between a picture and a slideshow.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { solid } from './blit/pattern';
import type { RenderOptions } from './blit/render';
import { createPresenter, type BackingCanvas, type Pixels2D } from './present';

interface Call {
  name: string;
  args: unknown[];
}

/** Every `new ImageData(...)` the run constructed, in order. */
let images: { data: unknown; width: number; height: number }[] = [];

class FakeImageData {
  constructor(
    public data: unknown,
    public width: number,
    public height: number,
  ) {
    images.push({ data, width, height });
  }
}

function withImageData(): void {
  images = [];
  (globalThis as { ImageData?: unknown }).ImageData = FakeImageData;
}

function withoutImageData(): void {
  images = [];
  delete (globalThis as { ImageData?: unknown }).ImageData;
}

afterEach(() => {
  delete (globalThis as { ImageData?: unknown }).ImageData;
});

function fakeContext(calls: Call[]): Pixels2D {
  return {
    imageSmoothingEnabled: true,
    putImageData: (...args: unknown[]) => calls.push({ name: 'putImageData', args }),
    clearRect: (...args: unknown[]) => calls.push({ name: 'clearRect', args }),
    drawImage: (...args: unknown[]) => calls.push({ name: 'drawImage', args }),
  } as unknown as Pixels2D;
}

/** A backing surface that is not a canvas, because nothing here needs one to be. */
function fakeBacking(calls: Call[], hasContext = true): BackingCanvas {
  return {
    width: 0,
    height: 0,
    getContext: () => (hasContext ? fakeContext(calls) : null),
  } as unknown as BackingCanvas;
}

function options(over: Partial<RenderOptions> = {}): RenderOptions {
  return { w: 4, h: 4, frame: 0, fps: 12, cycle: 8, ...over };
}

const PAT = solid('#e43b44');

describe('createPresenter: what it allocates, and how rarely', () => {
  it('reuses one pixel buffer across frames at the same size', () => {
    // A fresh buffer per frame is 60 allocations a second of the whole picture.
    // Identity is the only way to see the difference: both runs draw the same.
    withImageData();
    const calls: Call[] = [];
    const presenter = createPresenter(() => fakeBacking(calls));
    const ctx = fakeContext(calls);
    presenter.draw(PAT, options(), ctx, 64, 64);
    presenter.draw(PAT, options({ frame: 1 }), ctx, 64, 64);
    expect(images).toHaveLength(2);
    expect(images[1].data).toBe(images[0].data);
  });

  it('replaces the buffer when the picture changes size', () => {
    withImageData();
    const calls: Call[] = [];
    const presenter = createPresenter(() => fakeBacking(calls));
    const ctx = fakeContext(calls);
    presenter.draw(PAT, options(), ctx, 64, 64);
    presenter.draw(PAT, options({ w: 8, h: 8 }), ctx, 64, 64);
    expect(images[1].data).not.toBe(images[0].data);
    expect([images[1].width, images[1].height]).toEqual([8, 8]);
  });

  it('makes the backing surface once, and keeps it while the picture size holds', () => {
    withImageData();
    const calls: Call[] = [];
    let made = 0;
    const presenter = createPresenter((w, h) => {
      made += 1;
      const backing = fakeBacking(calls);
      backing.width = w;
      backing.height = h;
      return backing;
    });
    const ctx = fakeContext(calls);
    presenter.draw(PAT, options(), ctx, 64, 64);
    presenter.draw(PAT, options({ frame: 1 }), ctx, 64, 64);
    expect(made).toBe(1);
  });

  it('does not remake it when only the DISPLAY size changes', () => {
    // Zooming changes dw/dh every step. Remaking the backing canvas on a zoom
    // would throw away a whole surface per animation frame of the gesture.
    withImageData();
    const calls: Call[] = [];
    let made = 0;
    const presenter = createPresenter((w, h) => {
      made += 1;
      const backing = fakeBacking(calls);
      backing.width = w;
      backing.height = h;
      return backing;
    });
    const ctx = fakeContext(calls);
    presenter.draw(PAT, options(), ctx, 64, 64);
    presenter.draw(PAT, options(), ctx, 128, 128);
    presenter.draw(PAT, options(), ctx, 256, 256);
    expect(made).toBe(1);
  });

  it('remakes it when the picture size changes, at the new size', () => {
    withImageData();
    const calls: Call[] = [];
    const sizes: number[][] = [];
    const presenter = createPresenter((w, h) => {
      sizes.push([w, h]);
      const backing = fakeBacking(calls);
      backing.width = w;
      backing.height = h;
      return backing;
    });
    const ctx = fakeContext(calls);
    presenter.draw(PAT, options(), ctx, 64, 64);
    presenter.draw(PAT, options({ w: 16, h: 9 }), ctx, 64, 64);
    expect(sizes).toEqual([[4, 4], [16, 9]]);
  });
});

describe('createPresenter: the blit itself', () => {
  it('clears before it draws, with smoothing off, filling the display size', () => {
    // Order matters: drawing first and clearing after would clear the picture.
    // Smoothing is what separates pixel art from a blurred photograph of it.
    withImageData();
    const calls: Call[] = [];
    const presenter = createPresenter(() => fakeBacking(calls));
    const ctx = fakeContext(calls);
    presenter.draw(PAT, options(), ctx, 96, 48);
    const names = calls.map((c) => c.name);
    expect(names.indexOf('clearRect')).toBeLessThan(names.indexOf('drawImage'));
    expect(ctx.imageSmoothingEnabled).toBe(false);
    expect(calls.find((c) => c.name === 'clearRect')?.args).toEqual([0, 0, 96, 48]);
    const drawn = calls.find((c) => c.name === 'drawImage');
    expect(drawn?.args.slice(1)).toEqual([0, 0, 96, 48]);
  });

  it('draws the backing surface it filled, not something else', () => {
    withImageData();
    const calls: Call[] = [];
    let backing: BackingCanvas | null = null;
    const presenter = createPresenter(() => {
      backing = fakeBacking(calls);
      return backing;
    });
    presenter.draw(PAT, options(), fakeContext(calls), 32, 32);
    expect(calls.find((c) => c.name === 'drawImage')?.args[0]).toBe(backing);
  });

  it('puts the picture at its natural size, not at the display size', () => {
    withImageData();
    const calls: Call[] = [];
    const presenter = createPresenter(() => fakeBacking(calls));
    presenter.draw(PAT, options({ w: 5, h: 3 }), fakeContext(calls), 500, 300);
    expect([images[0].width, images[0].height]).toEqual([5, 3]);
  });
});

describe('createPresenter: hosts that cannot give it a 2D context', () => {
  it('never constructs an ImageData when the backing surface has no context', () => {
    // Load bearing, and the reason the ImageData is built INSIDE the optional
    // call: `?.` short-circuits its ARGUMENTS too. This is the property that
    // lets the component suite run in a DOM with no 2D canvas at all, where
    // constructing one would throw before anything could be asserted.
    withoutImageData();
    const calls: Call[] = [];
    const presenter = createPresenter(() => fakeBacking(calls, false));
    expect(() => presenter.draw(PAT, options(), fakeContext(calls), 32, 32)).not.toThrow();
    expect(calls.map((c) => c.name)).toEqual(['clearRect', 'drawImage']);
  });
});

describe('createPresenter: release', () => {
  it('drops the buffer and the surface, so the next draw builds both again', () => {
    withImageData();
    const calls: Call[] = [];
    let made = 0;
    const presenter = createPresenter(() => {
      made += 1;
      return fakeBacking(calls);
    });
    const ctx = fakeContext(calls);
    presenter.draw(PAT, options(), ctx, 64, 64);
    presenter.release();
    presenter.draw(PAT, options(), ctx, 64, 64);
    expect(made).toBe(2);
    expect(images[1].data).not.toBe(images[0].data);
  });

  it('is safe to call twice, and before anything was ever drawn', () => {
    const presenter = createPresenter(() => fakeBacking([]));
    expect(() => {
      presenter.release();
      presenter.release();
    }).not.toThrow();
  });
});
