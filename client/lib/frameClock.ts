/**
 * The frame counter, shared between the render loop and the things that display it.
 *
 * It cannot be React state. The loop advances it up to sixty times a second, and
 * a `setState` at that rate re-renders the editor with it, which is how a
 * live-coding surface starts dropping keystrokes. That is why the counter was a
 * plain ref to begin with.
 *
 * But a ref nothing can subscribe to means nothing can SHOW the frame, which left
 * the one thing Blit claims to be good at — editing an animation while it plays —
 * with no way to tell which frame you were looking at. So this is a ref with a
 * subscription: the loop writes, the paint path reads exactly, and a component
 * that wants to display the value subscribes and re-renders BY ITSELF. React
 * re-renders a subscriber, not its parents, so the readout updating cannot touch
 * the editor.
 *
 * The arithmetic below is pure and separate from the store on purpose: seeking
 * inside a cycle is the part with an off-by-one in it, and it is worth testing
 * without a clock, a canvas or a browser.
 */

export interface FrameClock {
  /** The exact current frame. What the renderer and the paint path read. */
  get(): number;
  /** Seek. Notifies immediately, so a scrub feels attached to the pointer. */
  set(frame: number): void;
  advance(by?: number): void;
  subscribe(listener: () => void): () => void;
}

export function createFrameClock(initial = 0): FrameClock {
  let frame = Math.max(0, Math.floor(initial));
  const listeners = new Set<() => void>();

  const publish = (next: number): void => {
    const clamped = Math.max(0, Math.floor(next));
    if (clamped === frame) return; // no work for a value that did not change
    frame = clamped;
    for (const listener of listeners) listener();
  };

  return {
    get: () => frame,
    set: publish,
    advance: (by = 1) => publish(frame + by),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Frames per cycle, as a number the arithmetic below can trust. */
function safeCycle(cycle: number): number {
  return Number.isFinite(cycle) && cycle >= 1 ? Math.floor(cycle) : 1;
}

/**
 * Where in the cycle a frame sits, 0-based.
 *
 * Derived with a modulo rather than stored, which is what makes a `cycle()` change
 * under a held frame safe: shortening the cycle from 16 to 4 while the frame sits
 * at slot 12 gives slot 0, in range, with nothing to clamp and no stale state to
 * correct.
 */
export function slotOf(frame: number, cycle: number): number {
  const c = safeCycle(cycle);
  const f = Math.max(0, Math.floor(frame));
  return f % c;
}

/** Which repetition of the cycle a frame is in, 0-based. */
export function cycleIndexOf(frame: number, cycle: number): number {
  return Math.floor(Math.max(0, Math.floor(frame)) / safeCycle(cycle));
}

/**
 * Seek to a slot WITHIN the cycle the clock is already in.
 *
 * Not to the absolute frame `slot`, which would also rewind the cycle counter and
 * change the phase of every operator defined against it (`.every`, `.palShift`).
 * Scrubbing a loop should move you along the loop, not to a different repetition
 * of it, so the cycle index is preserved and only the position inside it moves.
 */
export function seekWithinCycle(frame: number, cycle: number, slot: number): number {
  const c = safeCycle(cycle);
  const base = cycleIndexOf(frame, c) * c;
  const target = Number.isFinite(slot) ? Math.floor(slot) : 0;
  return base + Math.min(c - 1, Math.max(0, target));
}

/** One frame back, never past the beginning. */
export function stepBack(frame: number): number {
  return Math.max(0, Math.floor(frame) - 1);
}
