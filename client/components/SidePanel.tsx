/**
 * The panel frame both rails share.
 *
 * Fluent's shape: the panel sits directly on the tinted canvas, with no card and
 * no border, and is told apart from the workbench card beside it by that card's
 * own edge and shadow. Collapsing leaves a 48px rail with just the toggle.
 *
 * The resize edge is Fluent's splitter: invisible until hovered, focused or
 * dragged, then a short brand line down the middle of the gap. It is a real
 * element rather than a CSS resizer so it can carry a keyboard affordance and an
 * accessible name, and it reports `data-dragging` so the line stays lit while the
 * pointer wanders off it mid-drag.
 *
 * The collapse button is HANDED TO the panel rather than floated over it, which
 * is both what Fluent does (it belongs in the header, beside the panel's own
 * commands) and a bug fixed: as an `absolute right-2 top-2` button it sat exactly
 * on top of the Sketches header's New button and swallowed its clicks. Caught in
 * the browser, where Playwright reported the toggle intercepting pointer events;
 * nothing about the markup looked wrong.
 */

import { useCallback, useRef, useState, type ReactNode } from 'react';
import {
  PanelLeftContractRegular,
  PanelLeftExpandRegular,
  PanelRightContractRegular,
  PanelRightExpandRegular,
} from '@fluentui/react-icons';

import { FluentButton } from './fluent';
import { useChromeStyles } from './chrome';
import { MAX_PANEL, MIN_PANEL } from '../lib/panelState';

export interface SidePanelProps {
  side: 'left' | 'right';
  label: string;
  width: number;
  collapsed: boolean;
  onWidth: (width: number) => void;
  onToggle: () => void;
  /** Given the collapse button, so the panel decides where in its header it goes. */
  children: (collapse: ReactNode) => ReactNode;
}

export default function SidePanel({
  side,
  label,
  width,
  collapsed,
  onWidth,
  onToggle,
  children,
}: SidePanelProps) {
  const chrome = useChromeStyles();
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const delta = e.clientX - drag.startX;
      onWidth(drag.startWidth + (side === 'left' ? delta : -delta));
    },
    [onWidth, side],
  );

  const Toggle = collapsed
    ? side === 'left'
      ? PanelLeftExpandRegular
      : PanelRightExpandRegular
    : side === 'left'
      ? PanelLeftContractRegular
      : PanelRightContractRegular;

  if (collapsed) {
    return (
      <div className={chrome.rail}>
        <FluentButton
          onClick={onToggle}
          aria-label={`Show ${label}`}
          tooltip={`Show ${label}`}
          aria-expanded={false}
          icon={<Toggle />}
        />
      </div>
    );
  }

  const collapse = (
    <FluentButton
      size="small"
      onClick={onToggle}
      aria-label={`Hide ${label}`}
      tooltip={`Hide ${label}`}
      aria-expanded
      icon={<Toggle />}
    />
  );

  return (
    <div className="relative flex shrink-0 flex-col" style={{ width }}>
      <div className="flex min-h-0 flex-1 flex-col">{children(collapse)}</div>

      <div
        role="separator"
        aria-label={`Resize ${label}`}
        aria-orientation="vertical"
        aria-valuenow={width}
        aria-valuemin={MIN_PANEL}
        aria-valuemax={MAX_PANEL}
        tabIndex={0}
        className={chrome.splitter}
        data-side={side}
        data-dragging={dragging ? '' : undefined}
        onPointerDown={(e) => {
          dragRef.current = { startX: e.clientX, startWidth: width };
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
        onKeyDown={(e) => {
          const step = e.shiftKey ? 32 : 8;
          if (e.key === 'ArrowLeft') onWidth(width + (side === 'left' ? -step : step));
          else if (e.key === 'ArrowRight') onWidth(width + (side === 'left' ? step : -step));
          else return;
          e.preventDefault();
        }}
      />
    </div>
  );
}
