// @vitest-environment jsdom
/**
 * The handle moves a FRACTION from a gesture measured in pixels, so every test
 * here has to give the container a size: in jsdom every element is 0x0, and a
 * handle that divides by zero would report a share of Infinity while the real
 * browser looked fine.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import SplitHandle from './SplitHandle';

beforeAll(() => {
  // jsdom has no PointerEvent at all, and Testing Library builds the event with
  // whatever constructor the window has. Without this the event still fires and
  // still reaches the handler — it just arrives with no coordinates on it, which
  // is a drag of NaN pixels rather than a failure anyone would notice.
  window.PointerEvent = MouseEvent as unknown as typeof PointerEvent;

  // jsdom implements neither of these either, and the handle captures the
  // pointer so a drag survives the cursor leaving the 8px strip.
  HTMLElement.prototype.setPointerCapture = function setPointerCapture() {};
  HTMLElement.prototype.releasePointerCapture = function releasePointerCapture() {};
  HTMLElement.prototype.hasPointerCapture = function hasPointerCapture() {
    return false;
  };
});

afterEach(cleanup);

/** Render the handle with a parent of a known size, which is what it measures. */
function mount(axis: 'x' | 'y', share = 0.5) {
  const onShare = vi.fn();
  const onReset = vi.fn();
  const { container } = render(
    <SplitHandle axis={axis} share={share} onShare={onShare} onReset={onReset} label="the panes" />,
  );
  const handle = screen.getByRole('separator');
  const parent = handle.parentElement as HTMLElement;
  Object.defineProperty(parent, 'clientWidth', { configurable: true, value: 400 });
  Object.defineProperty(parent, 'clientHeight', { configurable: true, value: 200 });
  return { handle, onShare, onReset, container };
}

describe('SplitHandle', () => {
  it('says which way it splits, and where it is', () => {
    const { handle } = mount('y', 0.42);
    expect(handle.getAttribute('aria-orientation')).toBe('horizontal');
    expect(handle.getAttribute('aria-valuenow')).toBe('42');

    cleanup();
    expect(mount('x').handle.getAttribute('aria-orientation')).toBe('vertical');
  });

  it('turns a drag down into a share of the height it is in', () => {
    const { handle, onShare } = mount('y', 0.5);
    fireEvent.pointerDown(handle, { pointerId: 1, clientY: 100 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 140 });
    // 40px of a 200px column is a fifth, on top of the half it started at.
    expect(onShare).toHaveBeenCalledWith(0.7);
  });

  it('measures the other axis when it splits into columns', () => {
    const { handle, onShare } = mount('x', 0.5);
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 200 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 300 });
    // 100px of 400px wide, NOT of the 200px height the other axis would have used.
    expect(onShare).toHaveBeenCalledWith(0.75);
  });

  it('ignores a move that is not part of a drag', () => {
    const { handle, onShare } = mount('y');
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 180 });
    expect(onShare).not.toHaveBeenCalled();
  });

  it('lets go at the end of a drag', () => {
    const { handle, onShare } = mount('y', 0.5);
    fireEvent.pointerDown(handle, { pointerId: 1, clientY: 100 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 100 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 180 });
    expect(onShare).not.toHaveBeenCalled();
  });

  it('steps by pixels on the arrow keys, so the step is the same on every window', () => {
    const { handle, onShare } = mount('y', 0.5);
    fireEvent.keyDown(handle, { key: 'ArrowDown' });
    expect(onShare).toHaveBeenLastCalledWith(0.5 + 8 / 200);
    fireEvent.keyDown(handle, { key: 'ArrowUp', shiftKey: true });
    expect(onShare).toHaveBeenLastCalledWith(0.5 - 32 / 200);
  });

  it('uses the arrows that point along the split', () => {
    const { handle, onShare } = mount('x', 0.5);
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(onShare).toHaveBeenLastCalledWith(0.5 + 8 / 400);
    onShare.mockClear();
    // Up and down move nothing when the panes are beside each other.
    fireEvent.keyDown(handle, { key: 'ArrowDown' });
    expect(onShare).not.toHaveBeenCalled();
  });

  it('resets on a double click, and on Home for the keyboard', () => {
    const { handle, onReset } = mount('y');
    fireEvent.doubleClick(handle);
    expect(onReset).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(handle, { key: 'Home' });
    expect(onReset).toHaveBeenCalledTimes(2);
  });

  it('does nothing rather than dividing by a container of no size', () => {
    const onShare = vi.fn();
    render(<SplitHandle axis="y" share={0.5} onShare={onShare} onReset={() => {}} label="the panes" />);
    const handle = screen.getByRole('separator');
    fireEvent.pointerDown(handle, { pointerId: 1, clientY: 100 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 140 });
    fireEvent.keyDown(handle, { key: 'ArrowDown' });
    expect(onShare).not.toHaveBeenCalled();
  });
});
