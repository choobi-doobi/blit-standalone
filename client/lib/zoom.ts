/**
 * How closely the canvas is being looked at.
 *
 * Zoom is the one view setting that is NOT expressible in the sketch. Canvas
 * size, frame rate and cycle length are set by the code (`size()`, `fps()`,
 * `cycle()`) and deliberately have no column, because duplicating them would give
 * the same fact two homes. Zoom has no home in the code at all — it is how far
 * away you are standing, not part of the picture — so the sketch row is the only
 * place it can be remembered, and it is remembered per sketch: a 128x128 import
 * and a 16x16 icon are not looked at from the same distance.
 *
 * The steps here are the whole vocabulary. Both the chips in the View section and
 * the route's validation read this list, so a value the editor cannot select is
 * one the API will not store either — a stored 5 would open with no chip lit and
 * no way back to it.
 */

/** The zoom steps the editor offers, in the order the chips are laid out. */
export const ZOOMS: readonly number[] = Object.freeze([1, 2, 4, 8, 12, 16]);

/**
 * What a sketch opens at when it has never been saved.
 *
 * `migrations/002_zoom.sql` repeats it as the column default, for a row written
 * by anything that does not send one; the migration test pins the two together.
 */
export const DEFAULT_ZOOM = 2;

export function isZoom(value: unknown): value is number {
  return typeof value === 'number' && ZOOMS.includes(value);
}

/**
 * A stored zoom, made safe to render at.
 *
 * The client's side of the contract: a row written before the column existed
 * reads as null, and the API is reachable by things that are not this editor.
 * Neither is a reason for the canvas to size itself off NaN.
 */
export function normalizeZoom(value: unknown): number {
  return isZoom(value) ? value : DEFAULT_ZOOM;
}

/**
 * The most device pixels the on-screen canvas may allocate.
 *
 * Zoom multiplies the cost by its SQUARE, and `size()` goes to 512: at 16x that
 * is an 8192-square canvas before the device pixel ratio doubles it again. A
 * browser refuses to allocate the result — the canvas comes back blank, with no
 * error — so the backing store is budgeted rather than left to fail. 33M pixels
 * is about 130MB, which is generous for every real sketch and reached only by
 * the two or three largest steps on the largest canvases.
 */
export const MAX_CANVAS_PIXELS = 33_000_000;

/**
 * How many device pixels to allocate per sketch pixel.
 *
 * Normally `zoom * dpr`: one backing pixel per device pixel, which is what keeps
 * a hard edge hard on a retina screen. When that will not fit the budget the
 * scale drops to a WHOLE DIVISION of the zoom — 16 becomes 8, then 4 — so the
 * browser's own upscale is by an integer and every sketch pixel stays the same
 * size as its neighbours. A non-integer fallback would make some pixels three
 * screen pixels wide and some four, which on pixel art reads as a rendering bug.
 */
export function backingScale(w: number, h: number, zoom: number, dpr: number): number {
  const area = Math.max(1, w) * Math.max(1, h);
  const fits = (scale: number): boolean => area * scale * scale <= MAX_CANVAS_PIXELS;

  const ideal = Math.max(1, zoom) * (dpr > 0 ? dpr : 1);
  if (fits(ideal)) return ideal;

  for (let divide = 1; divide <= Math.max(1, zoom); divide += 1) {
    const scale = zoom / divide;
    if (scale <= ideal && fits(scale)) return scale;
  }
  // Even one backing pixel per sketch pixel is over budget, which takes a canvas
  // no `size()` can ask for. Draw it small rather than not at all.
  return Math.max(0.01, Math.sqrt(MAX_CANVAS_PIXELS / area));
}

/**
 * Where to scroll to after a zoom, so that what was in the middle of the view
 * stays in the middle of the view.
 *
 * Without this a zoom leaves `scrollLeft` alone while the picture around it
 * grows, so going from 2x to 16x on a large sprite drops you in its top-left
 * corner. Every image viewer zooms about the centre instead.
 *
 * The arithmetic works in the scroll port's own coordinates. The picture is
 * always centred in the scrollable area — auto margins when it fits, equal
 * padding when it does not — so half the span IS the middle of the picture, both
 * before and after, and the only thing that moves is how far the view sits from
 * it.
 */
export function recentre(view: {
  /** The scroll offset BEFORE the zoom; the browser may already have clamped it. */
  scroll: number;
  /** The scroll port along this axis. */
  port: number;
  /** The picture's length along this axis before the zoom, and after it. */
  before: number;
  after: number;
  /** The scroll port's padding at each end. */
  pad: number;
}): number {
  const spanBefore = Math.max(view.port, view.before + view.pad * 2);
  const spanAfter = Math.max(view.port, view.after + view.pad * 2);
  const ratio = view.before > 0 ? view.after / view.before : 1;
  const from = view.scroll + view.port / 2 - spanBefore / 2;
  const to = spanAfter / 2 + from * ratio - view.port / 2;
  return Math.max(0, Math.min(spanAfter - view.port, to));
}
