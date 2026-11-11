/**
 * The handle between the canvas and the editor.
 *
 * Fluent's splitter, the same one the side panels use: invisible until you hover
 * it, focus it or drag it, and then a short brand line down the middle of the
 * gap. It is a real focusable element rather than a CSS resizer so it can carry
 * a keyboard affordance and an accessible name.
 *
 * It moves a FRACTION, not a pixel count, so the drag has to know how big the
 * container is. That is measured from the handle's own parent at the moment the
 * gesture starts rather than held in state: the card resizes with the window and
 * a size captured at mount would be wrong by the time anybody dragged.
 *
 * The keyboard steps in PIXELS (8, or 32 with Shift) like the panel splitter
 * does, converted through the same measurement. A fraction-sized step would move
 * by a different amount on every window, which is exactly the thing an arrow key
 * is supposed not to do.
 */

import { useCallback, useRef, useState } from 'react';

import { useChromeStyles } from './chrome';
import { MAX_SHARE, MIN_SHARE } from '../lib/workbench';

export interface SplitHandleProps {
  /** `x` splits into columns (a vertical line); `y` stacks them (a horizontal one). */
  axis: 'x' | 'y';
  share: number;
  onShare: (share: number) => void;
  onReset: () => void;
  label: string;
}

export default function SplitHandle({ axis, share, onShare, onReset, label }: SplitHandleProps) {
  const chrome = useChromeStyles();
  const dragRef = useRef<{ start: number; startShare: number; size: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const containerSize = useCallback(
    (el: HTMLElement): number => {
      const parent = el.parentElement;
      if (!parent) return 0;
      return axis === 'x' ? parent.clientWidth : parent.clientHeight;
    },
    [axis],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.size <= 0) return;
      const at = axis === 'x' ? e.clientX : e.clientY;
      onShare(drag.startShare + (at - drag.start) / drag.size);
    },
    [axis, onShare],
  );

  return (
    <div
      role="separator"
      aria-label={`Resize ${label}`}
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      aria-valuenow={Math.round(share * 100)}
      aria-valuemin={Math.round(MIN_SHARE * 100)}
      aria-valuemax={Math.round(MAX_SHARE * 100)}
      tabIndex={0}
      className={chrome.split}
      data-axis={axis}
      data-dragging={dragging ? '' : undefined}
      onPointerDown={(e) => {
        dragRef.current = {
          start: axis === 'x' ? e.clientX : e.clientY,
          startShare: share,
          size: containerSize(e.currentTarget),
        };
        setDragging(true);
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => {
        dragRef.current = null;
        setDragging(false);
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      }}
      onDoubleClick={onReset}
      onKeyDown={(e) => {
        const size = containerSize(e.currentTarget);
        if (e.key === 'Home') {
          onReset();
        } else if (size > 0) {
          const step = (e.shiftKey ? 32 : 8) / size;
          const back = axis === 'x' ? 'ArrowLeft' : 'ArrowUp';
          const forward = axis === 'x' ? 'ArrowRight' : 'ArrowDown';
          if (e.key === back) onShare(share - step);
          else if (e.key === forward) onShare(share + step);
          else return;
        } else return;
        e.preventDefault();
      }}
    />
  );
}
