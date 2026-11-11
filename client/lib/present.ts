/**
 * Pattern to pixels, on any 2D surface.
 *
 * Extracted from the canvas component's draw loop so that every surface showing
 * a sketch runs ONE renderer rather than several that drift. The component keeps
 * everything that is about being a component: the scroll port, the zoom
 * recentre, the pointer paint, its own frame loop and the pixel grid. This keeps
 * the three steps that are about pixels, and they are the only three steps a
 * second surface would need.
 *
 * Nothing here touches `document`. The backing surface arrives through a
 * factory, which is `document.createElement('canvas')` on a page and
 * `new OffscreenCanvas(w, h)` anywhere without one. That is also why this file
 * sits at `client/lib/` rather than inside the engine directory: the engine is
 * pure TypeScript with no DOM dependency and is imported by the server's lint
 * route, while `new ImageData(...)` is a runtime constructor that only a browser
 * or a worker has. `client/lib/decodeImage.ts` is the established boundary and
 * this is the same side of it.
 *
 * The picture is drawn at its NATURAL size onto the backing surface and then
 * blitted up with smoothing off. Rendering the pattern at display resolution
 * would sample it thousands of times over and give soft edges, which is the
 * opposite of the point.
 */

import { renderToRgba, type RenderOptions, type RgbaBuffer } from './blit/render';
import type { Pat } from './blit/pattern';

/** Either kind of canvas: one on a page, one in a worker. */
export type BackingCanvas = HTMLCanvasElement | OffscreenCanvas;

/** Either kind of 2D context, which have the same three methods this needs. */
export type Pixels2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface Presenter {
  /**
   * Render one frame of `pat` and blit it into `ctx`, filling `dw` by `dh`.
   *
   * SYNCHRONOUS, with no `await` anywhere in it, and every caller depends on
   * that: a frame drawn inside an animation callback or inside one message
   * handler must land in the same task, because a blit deferred to a later one
   * paints the wrong frame or nothing at all.
   */
  draw(pat: Pat, o: RenderOptions, ctx: Pixels2D, dw: number, dh: number): void;
  /** Drop the reusable buffer and the backing surface. */
  release(): void;
}

export function createPresenter(makeBacking: (w: number, h: number) => BackingCanvas): Presenter {
  let buffer: RgbaBuffer | undefined;
  let backing: BackingCanvas | undefined;
  let backingCtx: Pixels2D | null = null;

  return {
    draw(pat, o, ctx, dw, dh) {
      const w = Math.max(1, Math.round(o.w));
      const h = Math.max(1, Math.round(o.h));

      buffer = renderToRgba(pat, o, buffer);

      if (!backing || backing.width !== w || backing.height !== h) {
        backing = makeBacking(w, h);
        backing.width = w;
        backing.height = h;
        backingCtx = backing.getContext('2d') as Pixels2D | null;
      }

      // The ImageData is constructed INSIDE the optional call on purpose: `?.`
      // short-circuits its arguments too, so a host that cannot give out a 2D
      // context never constructs one at all. Hoisting this into a local would
      // throw `ImageData is not defined` on exactly those hosts.
      backingCtx?.putImageData(new ImageData(buffer, w, h), 0, 0);

      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, dw, dh);
      ctx.drawImage(backing, 0, 0, dw, dh);
    },

    release() {
      buffer = undefined;
      backing = undefined;
      backingCtx = null;
    },
  };
}
