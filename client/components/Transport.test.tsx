// @vitest-environment jsdom
/**
 * The readout is the one thing on the page that changes with the animation, so
 * these tests are about it tracking the clock WITHOUT the clock being state. The
 * scrub is Fluent's Slider now, so these assert Blit's own contract with it: the
 * slot math it is fed, the cycle it spans, the text it announces, and that it is
 * a member of the toolbar's roving focus.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FluentProvider, webDarkTheme } from '@fluentui/react-components';

import Transport from './Transport';
import { createFrameClock } from '../lib/frameClock';

afterEach(cleanup);

/** Every Fluent control needs a provider for its tokens; render inside one. */
function draw(ui: React.ReactElement) {
  return render(<FluentProvider theme={webDarkTheme}>{ui}</FluentProvider>);
}

describe('Transport', () => {
  it('reads out the slot in the cycle, not the absolute frame', () => {
    const clock = createFrameClock(37);
    draw(<Transport clock={clock} cycle={8} onSeek={() => {}} />);
    // Frame 37 is slot 5 of an 8-frame cycle. Showing 37 would be true and
    // useless: what a time operator keys off is the position in the loop.
    expect(screen.getByTitle(/Frame 37 overall/).textContent).toBe('5/8');
  });

  it('follows the clock without the page re-rendering', () => {
    const clock = createFrameClock(0);
    const { container } = draw(<Transport clock={clock} cycle={4} onSeek={() => {}} />);
    const readout = () => container.querySelector('[data-frame-readout]')?.textContent;
    act(() => clock.advance(3));
    expect(readout()).toBe('3/4');
    act(() => clock.advance(1));
    // Wrapped, because the slot is derived with a modulo rather than stored.
    expect(readout()).toBe('0/4');
  });

  it('stops following once it is gone', () => {
    const clock = createFrameClock(0);
    const listeners = vi.spyOn(clock, 'subscribe');
    const { unmount } = draw(<Transport clock={clock} cycle={4} onSeek={() => {}} />);
    expect(listeners).toHaveBeenCalled();
    unmount();
    // No throw and no warning: the subscription has to be released, or every
    // re-mount leaves another listener running for the life of the page.
    expect(() => clock.advance(1)).not.toThrow();
  });

  it('seeks within the current cycle rather than jumping to another one', () => {
    const clock = createFrameClock(37);
    const onSeek = vi.fn();
    draw(<Transport clock={clock} cycle={8} onSeek={onSeek} />);
    fireEvent.change(screen.getByRole('slider'), { target: { value: '1' } });
    // 33, not 1: rewinding to frame 1 would also change the phase of `.every`.
    expect(onSeek).toHaveBeenCalledWith(33);
  });

  it('spans exactly the cycle', () => {
    draw(<Transport clock={createFrameClock()} cycle={8} onSeek={() => {}} />);
    const slider = screen.getByRole('slider');
    expect(slider.getAttribute('min')).toBe('0');
    expect(slider.getAttribute('max')).toBe('7');
  });

  it('says what the number means, since a bare slider announces only a digit', () => {
    draw(<Transport clock={createFrameClock(2)} cycle={8} onSeek={() => {}} />);
    expect(screen.getByRole('slider').getAttribute('aria-valuetext')).toBe('Frame 2 of 8');
  });

  it('is disabled for a sketch with nothing to scrub through', () => {
    // `cycle(1)` is a still image. A one-position slider is a control that lies
    // about being operable.
    draw(<Transport clock={createFrameClock()} cycle={1} onSeek={() => {}} />);
    expect((screen.getByRole('slider') as HTMLInputElement).disabled).toBe(true);
  });

  it('points the slider at the current slot, which is what fills its rail', () => {
    // 2 of a 5-frame cycle. The slider's own fill follows its value, so a wrong
    // value here is a rail that disagrees with its own thumb.
    draw(<Transport clock={createFrameClock(2)} cycle={5} onSeek={() => {}} />);
    expect((screen.getByRole('slider') as HTMLInputElement).value).toBe('2');
  });

  it('is a member of the toolbar it sits in', () => {
    // A bare range input carries no marker: the detector must discriminate, or a
    // missing marker would read as present forever.
    const { container: plain } = render(<input type="range" />);
    expect(plain.querySelector('input')?.hasAttribute('data-bf-item')).toBe(false);
    cleanup();
    // Without the marker the bar's roving focus skips it, so the scrub would be
    // unreachable by keyboard from the rest of the transport.
    draw(<Transport clock={createFrameClock()} cycle={8} onSeek={() => {}} />);
    expect(screen.getByRole('slider').hasAttribute('data-bf-item')).toBe(true);
  });
});
