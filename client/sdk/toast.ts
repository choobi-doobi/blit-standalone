/**
 * Transient notifications. `toast()` can be called from anywhere; the
 * `<AppToaster>` mounted in main.tsx registers the sink that renders them.
 */
export type ToastKind = 'success' | 'error' | 'warning' | 'info';

export interface ToastInput {
  type: ToastKind;
  message: string;
  /** ms before auto-dismiss; `0` pins it. Default 5000. */
  duration?: number;
}

let sink: ((input: ToastInput) => void) | null = null;

/** Install (or with null, remove) the renderer. */
export function setToastSink(next: ((input: ToastInput) => void) | null): void {
  sink = next;
}

/** Show a toast. Fire-and-forget; never throws. */
export function toast(input: ToastInput): void {
  try {
    sink?.(input);
  } catch (err) {
    console.warn('[blit] toast failed', err);
  }
}
