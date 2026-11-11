/**
 * The frame readout and the scrub, in the command bar.
 *
 * This is the one component that re-renders with the animation, and it is the
 * whole reason `FrameClock` is a subscribable store rather than a plain ref.
 * Subscribing HERE means React re-renders these two elements and nothing else:
 * the editor, the canvas and the panels are not in the subscription, so a running
 * sketch cannot cost a keystroke. Lifting the frame into page state would undo
 * that, which is why the clock is passed down rather than its value.
 *
 * The scrub is Fluent's Slider; its filled rail and thumb come from the theme's
 * brand tokens, so there is no hand-drawn track. The slot is derived from the
 * absolute frame with a modulo, never stored, so a sketch that shortens its own
 * `cycle()` while a frame is held cannot leave the slider past its own maximum.
 *
 * Seeking pauses. A scrub that kept playing would fight the pointer, and the
 * reason to reach for it at all is to stop on a frame and look at it.
 */

import { useSyncExternalStore } from 'react';
import { Slider, makeStyles, tokens, type SliderProps } from '@fluentui/react-components';

import { cycleIndexOf, seekWithinCycle, slotOf, type FrameClock } from '../lib/frameClock';

export interface TransportProps {
  clock: FrameClock;
  /** Frames per cycle, from the sketch's own `cycle()`. */
  cycle: number;
  onSeek: (frame: number) => void;
}

const useStyles = makeStyles({
  transport: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '0 4px',
  },
  scrub: {
    width: '120px',
  },
  frame: {
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase200,
    fontVariantNumeric: 'tabular-nums',
    lineHeight: tokens.lineHeightBase200,
    whiteSpace: 'nowrap',
  },
  sep: {
    padding: '0 2px',
    color: tokens.colorNeutralForeground4,
  },
});

export default function Transport({ clock, cycle, onSeek }: TransportProps) {
  const styles = useStyles();
  const frame = useSyncExternalStore(clock.subscribe, clock.get, clock.get);
  const slot = slotOf(frame, cycle);
  const last = Math.max(0, cycle - 1);

  return (
    <div className={styles.transport}>
      <Slider
        className={styles.scrub}
        size="small"
        min={0}
        max={last}
        step={1}
        value={slot}
        disabled={last === 0}
        // A range input announces a bare number; the cycle length is what makes
        // it mean anything, so the roving-focus marker and the announced text both
        // ride on the input the browser treats as the slider.
        input={
          {
            'data-bf-item': '',
            'aria-label': 'Frame in cycle',
            'aria-valuetext': `Frame ${slot} of ${cycle}`,
          } as SliderProps['input']
        }
        onChange={(_e, data) => onSeek(seekWithinCycle(clock.get(), cycle, data.value))}
      />
      {/* The absolute frame and the repetition are what a time operator like
          `.every(4)` actually keys off, so they stay reachable without spending
          bar width on them. */}
      <span
        className={styles.frame}
        data-frame-readout=""
        title={`Frame ${frame} overall · cycle ${cycleIndexOf(frame, cycle)}`}
      >
        {slot}
        <span className={styles.sep}>/</span>
        {cycle}
      </span>
    </div>
  );
}
