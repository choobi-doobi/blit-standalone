import { describe, expect, it, vi } from 'vitest';

import { createFrameClock, cycleIndexOf, seekWithinCycle, slotOf, stepBack } from './frameClock';

describe('createFrameClock', () => {
  it('starts where it was told to and reads back exactly', () => {
    expect(createFrameClock().get()).toBe(0);
    expect(createFrameClock(7).get()).toBe(7);
  });

  it('advances by one by default and by whatever it is given', () => {
    const clock = createFrameClock();
    clock.advance();
    clock.advance(3);
    expect(clock.get()).toBe(4);
  });

  it('tells subscribers, and stops when they leave', () => {
    const clock = createFrameClock();
    const listener = vi.fn();
    const off = clock.subscribe(listener);
    clock.advance();
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    clock.advance();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('says nothing when the value did not actually change', () => {
    // The render loop asks on every animation frame whether to advance, which at
    // 12fps is most of them doing nothing. A notify per rAF would re-render the
    // readout sixty times a second to show the same number.
    const clock = createFrameClock(5);
    const listener = vi.fn();
    clock.subscribe(listener);
    clock.set(5);
    clock.advance(0);
    expect(listener).not.toHaveBeenCalled();
    clock.set(6);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('never goes below zero or off the integers', () => {
    const clock = createFrameClock();
    clock.set(-10);
    expect(clock.get()).toBe(0);
    clock.set(3.7);
    expect(clock.get()).toBe(3);
    clock.advance(-99);
    expect(clock.get()).toBe(0);
  });

  it('notifies a seek immediately, so a scrub feels attached to the pointer', () => {
    const clock = createFrameClock();
    const listener = vi.fn();
    clock.subscribe(listener);
    clock.set(40);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(clock.get()).toBe(40);
  });
});

describe('slotOf', () => {
  it('is the position inside the cycle, 0-based', () => {
    expect(slotOf(0, 8)).toBe(0);
    expect(slotOf(3, 8)).toBe(3);
    expect(slotOf(8, 8)).toBe(0);
    expect(slotOf(37, 8)).toBe(5);
  });

  it('stays in range when the cycle shrinks under a held frame', () => {
    // This is the clamp the transport needs, and it comes free from deriving the
    // slot instead of storing it: a slider whose max just dropped cannot be left
    // pointing past the end.
    expect(slotOf(12, 4)).toBe(0);
    expect(slotOf(15, 4)).toBe(3);
    expect(slotOf(15, 4)).toBeLessThan(4);
  });

  it('treats a nonsense cycle as one frame long rather than dividing by it', () => {
    expect(slotOf(5, 0)).toBe(0);
    expect(slotOf(5, -3)).toBe(0);
    expect(slotOf(5, Number.NaN)).toBe(0);
  });
});

describe('cycleIndexOf', () => {
  it('counts repetitions of the cycle', () => {
    expect(cycleIndexOf(0, 8)).toBe(0);
    expect(cycleIndexOf(7, 8)).toBe(0);
    expect(cycleIndexOf(8, 8)).toBe(1);
    expect(cycleIndexOf(37, 8)).toBe(4);
  });
});

describe('seekWithinCycle', () => {
  it('moves along the current loop instead of jumping to another repetition', () => {
    // Frame 37 is slot 5 of cycle 4. Seeking to slot 1 means frame 33, NOT frame
    // 1: rewinding to frame 1 would also change the phase of every operator
    // defined against the cycle.
    expect(seekWithinCycle(37, 8, 1)).toBe(33);
    expect(cycleIndexOf(seekWithinCycle(37, 8, 1), 8)).toBe(cycleIndexOf(37, 8));
  });

  it('keeps the first cycle simple', () => {
    expect(seekWithinCycle(0, 8, 0)).toBe(0);
    expect(seekWithinCycle(3, 8, 6)).toBe(6);
  });

  it('clamps a slot outside the cycle to its ends', () => {
    expect(seekWithinCycle(0, 8, 99)).toBe(7);
    expect(seekWithinCycle(0, 8, -4)).toBe(0);
    expect(seekWithinCycle(16, 8, 8)).toBe(23);
  });

  it('survives a nonsense cycle or slot', () => {
    expect(seekWithinCycle(5, 0, 2)).toBe(5);
    expect(seekWithinCycle(5, 8, Number.NaN)).toBe(0);
  });
});

describe('stepBack', () => {
  it('goes back one frame and stops at the beginning', () => {
    expect(stepBack(5)).toBe(4);
    expect(stepBack(1)).toBe(0);
    expect(stepBack(0)).toBe(0);
    expect(stepBack(-3)).toBe(0);
  });
});
