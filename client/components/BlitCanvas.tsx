/**
 * The canvas: the render loop, and the click that edits the source.
 *
 * Two things here are deliberate and easy to get wrong.
 *
 * FIRST, the frame counter is not React state. A 60fps loop that sets state
 * re-renders the whole editor sixty times a second, which is how a live-coding
 * surface ends up dropping keystrokes. The loop advances a `FrameClock` instead,
 * which the readout in the command bar subscribes to on its own — so the number
 * on screen tracks the animation while this component's neighbours are untouched.
 * See lib/frameClock.
 *
 * SECOND, the picture is drawn at its NATURAL size onto an offscreen canvas and
 * then blitted up with smoothing off. Rendering the pattern at display
 * resolution would sample it thousands of times over and give soft edges.
 *
 * THIRD, the canvas's CSS size is set in the markup and its BACKING STORE in the
 * loop. They are two different jobs: the CSS size is layout, which the scroll
 * port has to have measured before a layout effect can put the view back where
 * it was, and the loop runs long after React has committed. Setting the style
 * from inside the loop, as this used to, means a zoom is one animation frame
 * late — long enough that anything measuring the picture measures the old one.
 *
 * FOURTH, scene mode drags a placed sketch WITHOUT re-evaluating. The instance's
 * position is a mutable holder its pattern reads on every sample (see
 * lib/blit/scene), so a pointer move writes the holder and asks for a redraw,
 * and the source is rewritten once, on release. Re-evaluating per move would
 * re-run a 512x512 scene's inspection pass on every pixel the pointer crosses.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';

import type { FrameClock } from '../lib/frameClock';
import { backingScale, recentre } from '../lib/zoom';
import { createPresenter, type Presenter } from '../lib/present';
import { probeAt, type RenderOptions } from '../lib/blit/render';
import type { AudioFrame } from '../lib/blit/audio';
import { siteFromError, type Site } from '../lib/blit/errorSite';
import type { Sketch } from '../lib/blit/evaluate';
import type { SpriteHit } from '../lib/blit/pattern';

/** What a click on the canvas does: paint a character, or pick up a placed sketch. */
export type CanvasMode = 'paint' | 'scene';

// blit-neutral-alpha: instance boxes are drawn over ARBITRARY scene pixels with
// the canvas API, where no theme class reaches; a dark halo under a light line
// reads over any colour the sketch put there.
const BOX_IDLE = 'rgba(255, 255, 255, 0.7)';
const BOX_HALO = 'rgba(0, 0, 0, 0.65)';
const BOX_LINE = 'rgba(255, 255, 255, 0.95)';

export interface BlitCanvasProps {
  sketch: Sketch;
  playing: boolean;
  zoom: number;
  showGrid: boolean;
  /** Owned by the page so the frame survives a re-evaluation: edits do not jump. */
  clock: FrameClock;
  /** A click resolved to a sprite cell. `null` when the pixel has no source. */
  /**
   * `strokeStart` is true for the first cell of a gesture and false for every
   * cell the pointer drags through afterwards, so the page can make one stroke
   * one undo step instead of one per pixel.
   */
  onPaint?: (hit: SpriteHit | null, erase: boolean, strokeStart: boolean) => void;
  paintEnabled: boolean;
  /**
   * A sketch that throws part way through a loop, which frame 0 cannot catch.
   *
   * The position comes from the error's own stack, read against the form the
   * sketch compiled as — which is why `Sketch` carries that form at all.
   */
  onRenderError?: (message: string, site: Site | null) => void;
  /** Paint by default. In `scene`, a click selects a placed sketch and a drag moves it. */
  mode?: CanvasMode;
  /** The selected instance, outlined. */
  selected?: number | null;
  onSelect?: (id: number | null) => void;
  /** Instances whose position a drag may rewrite. See lib/blit/sceneEdit. */
  movable?: ReadonlySet<number>;
  /** A drag ended somewhere new: write it into the source. */
  onMove?: (id: number, x: number, y: number) => void;
  /** Show the previous frame faintly behind this one. */
  onion?: boolean;
  /** A checkerboard behind transparent pixels. */
  checker?: boolean;
  /** Live audio for the sketch's `audio`, read each frame. Null is silence. */
  audio?: (() => AudioFrame) | null;
}

interface Drag {
  id: number;
  pointer: number;
  from: { x: number; y: number };
  origin: { x: number; y: number };
  moved: boolean;
}

export default function BlitCanvas({
  sketch,
  playing,
  zoom,
  showGrid,
  clock,
  onPaint,
  paintEnabled,
  onRenderError,
  mode = 'paint',
  selected = null,
  onSelect,
  movable,
  onMove,
  onion = false,
  checker = true,
  audio = null,
}: BlitCanvasProps) {
  const audioRef = useRef(audio);
  audioRef.current = audio;
  const onionRef = useRef<{ canvas: HTMLCanvasElement; presenter: Presenter } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  /**
   * The renderer, shared with anything else that shows a sketch.
   *
   * Lazily built rather than `useRef(createPresenter(...))`, which evaluates its
   * argument on every render and throws all but the first result away.
   */
  const presenterRef = useRef<Presenter | null>(null);
  if (presenterRef.current === null) {
    presenterRef.current = createPresenter((width, height) => {
      const surface = document.createElement('canvas');
      surface.width = width;
      surface.height = height;
      return surface;
    });
  }
  const paintingRef = useRef(false);
  const lastCellRef = useRef<string>('');
  const dragRef = useRef<Drag | null>(null);
  /** Set by the loop: forget the drawn frame, so the next tick draws again. */
  const redrawRef = useRef<() => void>(() => undefined);
  const scene = mode === 'scene';

  const { w, h, fps, cycle, ramp } = sketch.settings;

  /**
   * Where the view was, and what it was looking at, at the last commit.
   *
   * The scroll offsets are kept here rather than read off the element when they
   * are needed, because zooming OUT shrinks the content and the browser has
   * already clamped `scrollLeft` by the time a layout effect gets to run.
   *
   * The zeroes are the first mount: no size matches them, so the first pass
   * takes the branch that centres, which is what a sketch reopened at 16x needs.
   */
  const viewRef = useRef({ zoom: 0, w: 0, h: 0, x: 0, y: 0 });

  const renderOptions = useCallback(
    (frame: number): RenderOptions => ({ w, h, frame, fps, cycle, ramp, audio: audioRef.current?.() }),
    [w, h, fps, cycle, ramp],
  );

  // ── The loop ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const step = 1000 / Math.max(1, fps);
    let raf = 0;
    let last = performance.now();
    let accumulated = 0;
    let drawnFrame = -1;
    let failed = false;
    redrawRef.current = () => {
      drawnFrame = -1;
    };

    const draw = (frame: number): void => {
      // The CSS size is the markup's; this is only how finely it is drawn.
      const scale = backingScale(w, h, zoom, window.devicePixelRatio || 1);
      const pxW = Math.max(1, Math.round(w * scale));
      const pxH = Math.max(1, Math.round(h * scale));

      if (canvas.width !== pxW || canvas.height !== pxH) {
        canvas.width = pxW;
        canvas.height = pxH;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      presenterRef.current?.draw(sketch.pattern, renderOptions(frame), ctx, pxW, pxH);

      if (onion && frame > 0) {
        onionRef.current ??= {
          canvas: document.createElement('canvas'),
          presenter: createPresenter((width, height) => {
            const surface = document.createElement('canvas');
            surface.width = width;
            surface.height = height;
            return surface;
          }),
        };
        const skin = onionRef.current;
        skin.canvas.width = pxW;
        skin.canvas.height = pxH;
        const skinCtx = skin.canvas.getContext('2d');
        if (skinCtx) {
          skin.presenter.draw(sketch.pattern, renderOptions(frame - 1), skinCtx, pxW, pxH);
          ctx.save();
          ctx.globalCompositeOperation = 'destination-over';
          ctx.globalAlpha = 0.3;
          ctx.drawImage(skin.canvas, 0, 0);
          ctx.restore();
        }
      }

      // The grid is an aid for placing pixels, so it only earns its keep once a
      // pixel is big enough to aim at.
      if (showGrid && zoom >= 6) {
        ctx.save();
        // blit-neutral-alpha: a grid over ARBITRARY pixel colours, drawn with the
        // canvas API where no class can reach. Alpha grey over whatever is
        // underneath reads on every theme; a theme token would not.
        ctx.strokeStyle = 'rgba(128, 128, 128, 0.35)';
        ctx.lineWidth = 1;
        for (let x = 1; x < w; x += 1) {
          const at = Math.round((x * pxW) / w) + 0.5;
          ctx.beginPath();
          ctx.moveTo(at, 0);
          ctx.lineTo(at, pxH);
          ctx.stroke();
        }
        for (let y = 1; y < h; y += 1) {
          const at = Math.round((y * pxH) / h) + 0.5;
          ctx.beginPath();
          ctx.moveTo(0, at);
          ctx.lineTo(pxW, at);
          ctx.stroke();
        }
        ctx.restore();
      }

      if (scene) drawInstances(ctx, pxW / w, pxH / h);
    };

    /** Every placed sketch's box, and the selected one's picked out. */
    const drawInstances = (ctx: CanvasRenderingContext2D, sx: number, sy: number): void => {
      ctx.save();
      const outline = (x: number, y: number, bw: number, bh: number): void => {
        ctx.strokeRect(Math.round(x * sx) + 0.5, Math.round(y * sy) + 0.5, Math.round(bw * sx) - 1, Math.round(bh * sy) - 1);
      };
      for (const instance of sketch.instances.values()) {
        if (instance.w === 0 || instance.id === selected) continue;
        ctx.setLineDash([]);
        ctx.lineWidth = 2;
        ctx.strokeStyle = BOX_HALO;
        outline(instance.pos.x, instance.pos.y, instance.w, instance.h);
        ctx.setLineDash([4, 3]);
        ctx.lineWidth = 1;
        ctx.strokeStyle = BOX_IDLE;
        outline(instance.pos.x, instance.pos.y, instance.w, instance.h);
      }
      const chosen = selected === null ? undefined : sketch.instances.get(selected);
      if (chosen && chosen.w > 0) {
        ctx.setLineDash([]);
        ctx.lineWidth = 3;
        ctx.strokeStyle = BOX_HALO;
        outline(chosen.pos.x, chosen.pos.y, chosen.w, chosen.h);
        ctx.lineWidth = 1;
        ctx.strokeStyle = BOX_LINE;
        outline(chosen.pos.x, chosen.pos.y, chosen.w, chosen.h);
      }
      ctx.restore();
    };

    const tick = (now: number): void => {
      if (failed) return;
      raf = requestAnimationFrame(tick);

      const delta = now - last;
      last = now;
      if (playing) {
        accumulated += delta;
        // After a background tab or a slow re-evaluation, skip the backlog rather
        // than fast-forwarding through hundreds of frames.
        if (accumulated > step * 8) accumulated = step;
        // Advanced in one publish rather than one per frame, so a backlog cannot
        // notify the readout several times for a single animation frame.
        let ahead = 0;
        while (accumulated >= step) {
          ahead += 1;
          accumulated -= step;
        }
        if (ahead > 0) clock.advance(ahead);
      }

      if (clock.get() === drawnFrame && !audioRef.current) return;
      drawnFrame = clock.get();
      try {
        draw(clock.get());
      } catch (error) {
        failed = true;
        cancelAnimationFrame(raf);
        onRenderError?.(
          error instanceof Error ? error.message : String(error),
          siteFromError(error, sketch.form),
        );
      }
    };

    raf = requestAnimationFrame(tick);
    const presenter = presenterRef.current;
    return () => {
      cancelAnimationFrame(raf);
      presenter?.release();
    };
  }, [sketch, playing, zoom, showGrid, w, h, fps, cycle, renderOptions, clock, onRenderError, scene, selected, onion]);

  // ── Staying where you were looking ────────────────────────────────────────
  /**
   * A zoom re-aims the view at the middle of what it was already showing, and a
   * different picture starts in the middle of itself.
   *
   * This has to be a LAYOUT effect: it measures the scroll port after the new
   * size has been committed and writes the scroll offsets back before the frame
   * is painted, so the view never flashes at the old position first.
   */
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const frame = frameRef.current;
    const was = viewRef.current;
    if (!el || !frame) return;

    const after = { x: frame.offsetWidth, y: frame.offsetHeight };
    if (was.w !== w || was.h !== h) {
      // A different sketch, not a closer look at this one. Nothing about where
      // you were in the old picture says anything about the new one.
      el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
      el.scrollTop = (el.scrollHeight - el.clientHeight) / 2;
    } else if (was.zoom !== zoom) {
      // The border is chrome around the picture, and it does not scale with the
      // zoom: the difference is what the picture was inside the same frame.
      const style = window.getComputedStyle(el);
      const pad = { x: parseFloat(style.paddingLeft) || 0, y: parseFloat(style.paddingTop) || 0 };
      const chrome = { x: after.x - w * zoom, y: after.y - h * zoom };

      el.scrollLeft = recentre({
        scroll: was.x,
        port: el.clientWidth,
        before: w * was.zoom + chrome.x,
        after: after.x,
        pad: pad.x,
      });
      el.scrollTop = recentre({
        scroll: was.y,
        port: el.clientHeight,
        before: h * was.zoom + chrome.y,
        after: after.y,
        pad: pad.y,
      });
    }

    viewRef.current = { zoom, w, h, x: el.scrollLeft, y: el.scrollTop };
  }, [zoom, w, h]);

  // ── The click ─────────────────────────────────────────────────────────────
  /** The canvas pixel under a point, which may be off the canvas: a drag can leave it. */
  const pointFor = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      // Derived from the live bounding box, so any CSS scaling is accounted for.
      return {
        x: Math.floor((clientX - rect.left) / (rect.width / w)),
        y: Math.floor((clientY - rect.top) / (rect.height / h)),
      };
    },
    [w, h],
  );

  const cellFor = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const point = pointFor(clientX, clientY);
      if (!point || point.x < 0 || point.y < 0 || point.x >= w || point.y >= h) return null;
      return point;
    },
    [pointFor, w, h],
  );

  /** Which placed sketch is under a point: the one you can see, else the box it is in. */
  const instanceAt = useCallback(
    (clientX: number, clientY: number): number | null => {
      const cell = cellFor(clientX, clientY);
      if (!cell) return null;
      return probeAt(sketch.pattern, renderOptions(clock.get()), cell.x, cell.y, 'blit')?.sourceId ?? null;
    },
    [cellFor, sketch, renderOptions, clock],
  );

  const pickUp = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>): void => {
      const id = instanceAt(e.clientX, e.clientY);
      onSelect?.(id);
      const instance = id === null ? undefined : sketch.instances.get(id);
      const from = pointFor(e.clientX, e.clientY);
      if (id === null || !instance || !from || !movable?.has(id)) return;
      dragRef.current = { id, pointer: e.pointerId, from, origin: { ...instance.pos }, moved: false };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [instanceAt, onSelect, sketch, pointFor, movable],
  );

  const dragTo = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>): void => {
      const drag = dragRef.current;
      if (!drag) {
        // Hover: say what a press here would do, without a React render per move.
        const id = instanceAt(e.clientX, e.clientY);
        e.currentTarget.style.cursor = id === null ? 'default' : movable?.has(id) ? 'move' : 'pointer';
        return;
      }
      const instance = sketch.instances.get(drag.id);
      const at = pointFor(e.clientX, e.clientY);
      if (!instance || !at) return;
      const x = drag.origin.x + at.x - drag.from.x;
      const y = drag.origin.y + at.y - drag.from.y;
      if (x === instance.pos.x && y === instance.pos.y) return;
      instance.pos.x = x;
      instance.pos.y = y;
      drag.moved = x !== drag.origin.x || y !== drag.origin.y;
      redrawRef.current();
    },
    [instanceAt, movable, sketch, pointFor],
  );

  const drop = useCallback(
    (cancelled: boolean): void => {
      const drag = dragRef.current;
      dragRef.current = null;
      if (!drag) return;
      const instance = sketch.instances.get(drag.id);
      if (!instance) return;
      if (cancelled || !drag.moved) {
        instance.pos.x = drag.origin.x;
        instance.pos.y = drag.origin.y;
        redrawRef.current();
        return;
      }
      onMove?.(drag.id, instance.pos.x, instance.pos.y);
    },
    [sketch, onMove],
  );

  const paint = useCallback(
    (clientX: number, clientY: number, erase: boolean): void => {
      if (!paintEnabled || !onPaint) return;
      const cell = cellFor(clientX, clientY);
      if (!cell) return;

      // Dragging fires continuously; only act when the cell actually changes.
      const key = `${cell.x},${cell.y},${erase ? 'e' : 'p'}`;
      if (key === lastCellRef.current) return;
      // Pointer-down clears `lastCellRef`, so an empty one means this is the
      // first cell of a new gesture. No extra state to keep in step.
      const strokeStart = lastCellRef.current === '';
      lastCellRef.current = key;

      onPaint(
        // Read EXACTLY, not from the readout: a paint has to resolve against the
        // frame on screen, not a value a display throttle might have rounded.
        probeAt(sketch.pattern, renderOptions(clock.get()), cell.x, cell.y),
        erase,
        strokeStart,
      );
    },
    [paintEnabled, onPaint, cellFor, sketch, renderOptions, clock],
  );

  return (
    /*
     * The scroll port. `m-auto` on the picture, NOT `items-center
     * justify-center` on this: flexbox centring splits the overflow between both
     * ends, and a scroll container can only reach the END of its content — so a
     * sprite bigger than the port lost its top and left edges behind the card
     * with no way to scroll back to them. Auto margins collapse to zero the
     * moment the free space goes negative, which centres a picture that fits and
     * scrolls one that does not, edge to edge, in every layout the workbench has.
     */
    <div
      ref={scrollRef}
      className="flex min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain p-4"
      onScroll={(e) => {
        viewRef.current.x = e.currentTarget.scrollLeft;
        viewRef.current.y = e.currentTarget.scrollTop;
      }}
    >
      <div ref={frameRef} className={`${checker ? 'blit-transparency ' : ''}m-auto shrink-0 rounded-md border border-border`}>
        <canvas
          ref={canvasRef}
          className="block"
          style={{
            // Layout, so React owns it; the loop owns the backing store only.
            width: `${w * zoom}px`,
            height: `${h * zoom}px`,
            cursor: scene ? 'default' : paintEnabled ? 'crosshair' : 'default',
            imageRendering: 'pixelated',
          }}
          onPointerDown={(e) => {
            if (scene) {
              if (e.button === 0) pickUp(e);
              return;
            }
            if (!paintEnabled) return;
            paintingRef.current = true;
            lastCellRef.current = '';
            e.currentTarget.setPointerCapture(e.pointerId);
            paint(e.clientX, e.clientY, e.button === 2 || e.altKey);
          }}
          onPointerMove={(e) => {
            if (scene) {
              dragTo(e);
              return;
            }
            if (!paintingRef.current) return;
            paint(e.clientX, e.clientY, e.altKey || (e.buttons & 2) !== 0);
          }}
          onPointerUp={(e) => {
            drop(false);
            paintingRef.current = false;
            lastCellRef.current = '';
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
              e.currentTarget.releasePointerCapture(e.pointerId);
            }
          }}
          onPointerCancel={() => {
            drop(true);
            paintingRef.current = false;
            lastCellRef.current = '';
          }}
          onContextMenu={(e) => e.preventDefault()}
        />
      </div>
    </div>
  );
}
