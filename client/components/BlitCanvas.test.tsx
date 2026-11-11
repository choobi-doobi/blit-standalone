// @vitest-environment jsdom
/**
 * The scroll port around the picture.
 *
 * jsdom has no layout engine, so none of this can measure a scroll offset. What
 * it CAN pin is the arrangement that makes scrolling possible at all, which is
 * where the bug was: a picture centred with `justify-center`/`items-center`
 * overflows a scroll container at BOTH ends, and a scroll container can only
 * reach the end of its content, so the top and left of a zoomed sprite were
 * unreachable. Auto margins collapse to zero when the space runs out, which is
 * the difference between a centred picture and a trapped one.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import BlitCanvas from './BlitCanvas';
import { createFrameClock } from '../lib/frameClock';
import { evaluateSketch } from '../lib/blit/evaluate';

afterEach(cleanup);

function mount(zoom: number, code = 'size(64, 64);\n\nout(sprite(`ww\\nww`).scale(32));\n') {
  const { container } = render(
    <BlitCanvas
      sketch={evaluateSketch(code)}
      playing={false}
      zoom={zoom}
      showGrid={false}
      clock={createFrameClock()}
      paintEnabled
    />,
  );
  const port = container.firstElementChild as HTMLElement;
  const frame = port.firstElementChild as HTMLElement;
  return { port, frame, canvas: frame.firstElementChild as HTMLCanvasElement };
}

describe('BlitCanvas', () => {
  it('scrolls, and does not centre in a way that puts the overflow out of reach', () => {
    const { port, frame } = mount(16);
    expect(port.className).toContain('overflow-auto');
    // The regression itself: either of these back on the port and the top-left
    // of a zoomed sprite is behind the card edge with no way to scroll to it.
    expect(port.className).not.toContain('justify-center');
    expect(port.className).not.toContain('items-center');
    expect(frame.className).toContain('m-auto');
  });

  it('lets the port shrink to whatever the layout gives it, in either arrangement', () => {
    // Stacked gives the canvas a share of the HEIGHT and side by side a share of
    // the WIDTH, and a flex child refuses to go below its content on the axis it
    // has no `min-*-0` for — which is how the picture pushed the editor out
    // instead of scrolling.
    const { port } = mount(16);
    expect(port.className).toContain('min-h-0');
    expect(port.className).toContain('min-w-0');
  });

  it('sizes the picture in the markup, so the port measures it on the same commit', () => {
    // Not in the animation loop: a size written a frame later is a size the
    // layout effect that re-aims the view cannot see.
    const { canvas } = mount(8);
    expect(canvas.style.width).toBe('512px');
    expect(canvas.style.height).toBe('512px');
    expect(mount(16).canvas.style.width).toBe('1024px');
  });

  it('keeps the picture at its own size rather than letting the port squeeze it', () => {
    expect(mount(16).frame.className).toContain('shrink-0');
  });
});

/**
 * The picture itself, through the shared renderer.
 *
 * The draw loop used to be welded into this component: it owned the pixel
 * buffer, the offscreen surface and the blit, which meant nothing else could
 * ever show a sketch without writing a second copy of them. The three steps that
 * are about pixels now live in `lib/present`, and what is asserted here is that
 * the COMPONENT still drives them, at the right sizes, with its own parts (the
 * backing-store sizing and the pixel grid) still wrapped around them.
 *
 * jsdom has no 2D context and no `ImageData` at all, so both are stubbed. That
 * absence is itself the reason `present.ts` builds its `ImageData` inside an
 * optional call: the other tests in this file run with the real, contextless
 * jsdom canvas and would throw `ImageData is not defined` before asserting
 * anything if that construction were ever hoisted out.
 */
describe('BlitCanvas draws through the shared renderer', () => {
  interface Call {
    on: HTMLCanvasElement;
    name: string;
    args: unknown[];
  }

  function painting(): {
    calls: Call[];
    frames: FrameRequestCallback[];
    contextOf: (canvas: HTMLCanvasElement) => { imageSmoothingEnabled: boolean } | undefined;
    restore: () => void;
  } {
    const calls: Call[] = [];
    const frames: FrameRequestCallback[] = [];
    const contexts = new WeakMap<HTMLCanvasElement, Record<string, unknown>>();
    const globals = globalThis as unknown as Record<string, unknown>;

    const realGetContext = HTMLCanvasElement.prototype.getContext;
    const realImageData = globals.ImageData;
    const realRequest = globals.requestAnimationFrame;
    const realCancel = globals.cancelAnimationFrame;

    globals.ImageData = class {
      constructor(
        public data: unknown,
        public width: number,
        public height: number,
      ) {}
    };
    globals.requestAnimationFrame = (cb: FrameRequestCallback): number => frames.push(cb);
    globals.cancelAnimationFrame = (): void => {};

    HTMLCanvasElement.prototype.getContext = function fake(this: HTMLCanvasElement) {
      const existing = contexts.get(this);
      if (existing) return existing as unknown as CanvasRenderingContext2D;
      const on = this;
      const record =
        (name: string) =>
        (...args: unknown[]): void => {
          calls.push({ on, name, args });
        };
      const context: Record<string, unknown> = {
        imageSmoothingEnabled: true,
        strokeStyle: '',
        lineWidth: 1,
        putImageData: record('putImageData'),
        clearRect: record('clearRect'),
        drawImage: record('drawImage'),
        save: record('save'),
        restore: record('restore'),
        beginPath: record('beginPath'),
        moveTo: record('moveTo'),
        lineTo: record('lineTo'),
        stroke: record('stroke'),
      };
      contexts.set(this, context);
      return context as unknown as CanvasRenderingContext2D;
    } as typeof HTMLCanvasElement.prototype.getContext;

    return {
      calls,
      frames,
      contextOf: (canvas) => contexts.get(canvas) as { imageSmoothingEnabled: boolean } | undefined,
      restore: () => {
        HTMLCanvasElement.prototype.getContext = realGetContext;
        globals.ImageData = realImageData;
        globals.requestAnimationFrame = realRequest;
        globals.cancelAnimationFrame = realCancel;
      },
    };
  }

  it('blits an offscreen picture of the sketch into the visible canvas, grid on top', () => {
    const harness = painting();
    try {
      const { canvas } = mount(8);
      expect(harness.frames.length).toBeGreaterThan(0);
      harness.frames[0](performance.now());

      // The backing store is the component's job and still happens first.
      expect([canvas.width, canvas.height]).toEqual([512, 512]);

      const drawn = harness.calls.find((c) => c.name === 'drawImage' && c.on === canvas);
      expect(drawn, 'the visible canvas was never drawn into').toBeDefined();
      // Filling the backing store, from a surface that is NOT the visible one.
      expect(drawn?.args.slice(1)).toEqual([0, 0, 512, 512]);
      const offscreen = drawn?.args[0] as HTMLCanvasElement;
      expect(offscreen).not.toBe(canvas);
      expect([offscreen.width, offscreen.height]).toEqual([64, 64]);

      // The picture went onto that surface at its NATURAL size, which is what
      // keeps a zoomed sprite's edges hard.
      const put = harness.calls.find((c) => c.name === 'putImageData' && c.on === offscreen);
      expect(put, 'the offscreen surface was never filled').toBeDefined();

      expect(harness.contextOf(canvas)?.imageSmoothingEnabled).toBe(false);
      expect(harness.calls.filter((c) => c.name === 'stroke')).toEqual([]);
    } finally {
      harness.restore();
    }
  });

  it('keeps one offscreen surface across frames rather than one per frame', () => {
    const harness = painting();
    try {
      const { canvas } = mount(8);
      harness.frames[0](performance.now());
      // A second frame of the same picture: the renderer must reuse its surface.
      const tick = harness.frames[harness.frames.length - 1];
      tick(performance.now());
      const surfaces = new Set(
        harness.calls.filter((c) => c.name === 'drawImage' && c.on === canvas).map((c) => c.args[0]),
      );
      expect(surfaces.size).toBe(1);
    } finally {
      harness.restore();
    }
  });

  it('still draws its own pixel grid over the blit, once the pixels are big enough', () => {
    const harness = painting();
    try {
      const { container } = render(
        <BlitCanvas
          sketch={evaluateSketch('size(8, 8);\n\nout(sprite(`ww\\nww`).scale(4));\n')}
          playing={false}
          zoom={8}
          showGrid
          clock={createFrameClock()}
          paintEnabled
        />,
      );
      const canvas = container.querySelector('canvas') as HTMLCanvasElement;
      harness.frames[0](performance.now());
      const names = harness.calls.filter((c) => c.on === canvas).map((c) => c.name);
      // Order is the assertion: a grid drawn before the blit is a grid the blit
      // paints over, which is a grid nobody can see.
      expect(names.indexOf('drawImage')).toBeLessThan(names.indexOf('stroke'));
      // 7 interior lines each way on an 8px picture.
      expect(harness.calls.filter((c) => c.name === 'stroke')).toHaveLength(14);
    } finally {
      harness.restore();
    }
  });
});
