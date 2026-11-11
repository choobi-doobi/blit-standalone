/**
 * The command bar: transport, then the file actions, then the sketch's identity.
 *
 * That order is Fluent's, and Strudel's Studio bar reads the same way: what you
 * are doing to the running thing comes first, what you are doing to the document
 * second, what the document IS third. The two state badges sit at the far end,
 * where they read as a report rather than as a warning.
 *
 * "Dirty" here means the buffer has moved since the last evaluation, which in a
 * live-coding tool is a first-class state rather than an error: you are mid-edit
 * and the canvas is still showing the last thing you committed. It is shown, not
 * corrected.
 */

import {
  ArrowResetRegular,
  NextRegular,
  PauseRegular,
  PlayRegular,
  PreviousRegular,
  SaveRegular,
  ShapesRegular,
  SparkleRegular,
} from '@fluentui/react-icons';

import Transport from './Transport';
import {
  FluentBadge,
  FluentButton,
  FluentDivider,
  FluentTitleField,
  FluentToolbar,
  FluentToolbarSpacer,
} from './fluent';
import { useChromeStyles } from './chrome';
import type { FrameClock } from '../lib/frameClock';

export interface ToolbarProps {
  name: string;
  onName: (name: string) => void;
  dirty: boolean;
  unsaved: boolean;
  playing: boolean;
  onPlaying: (playing: boolean) => void;
  onRun: () => void;
  onStep: () => void;
  onStepBack: () => void;
  onReset: () => void;
  /** The frame counter, subscribed to by the readout alone. See Transport. */
  clock: FrameClock;
  cycle: number;
  onSeek: (frame: number) => void;
  onSave: () => void;
  saving: boolean;
  /** Scene mode: the canvas picks up and moves placed sketches instead of painting. */
  scene: boolean;
  onScene: (scene: boolean) => void;
}

export default function Toolbar({
  name,
  onName,
  dirty,
  unsaved,
  playing,
  onPlaying,
  onRun,
  onStep,
  onStepBack,
  onReset,
  onSave,
  saving,
  clock,
  cycle,
  onSeek,
  scene,
  onScene,
}: ToolbarProps) {
  const chrome = useChromeStyles();
  return (
    <div className={`${chrome.cardDivider} flex h-12 shrink-0 items-center px-2`}>
      <FluentToolbar label="Blit commands" className="w-full">
        <FluentButton
          onClick={onStepBack}
          aria-label="Step back one frame"
          tooltip="Step back one frame (,)"
          icon={<PreviousRegular />}
        />
        <FluentButton
          onClick={() => onPlaying(!playing)}
          aria-label={playing ? 'Pause' : 'Play'}
          tooltip={playing ? 'Pause (Space)' : 'Play (Space)'}
          icon={playing ? <PauseRegular /> : <PlayRegular />}
        />
        <FluentButton
          onClick={onStep}
          aria-label="Step one frame"
          tooltip="Step one frame (.)"
          icon={<NextRegular />}
        />
        <FluentButton
          onClick={onReset}
          aria-label="Back to frame 0"
          tooltip="Back to frame 0"
          icon={<ArrowResetRegular />}
        />

        <Transport clock={clock} cycle={cycle} onSeek={onSeek} />

        <FluentDivider />

        <FluentButton
          appearance="primary"
          onClick={onRun}
          icon={<SparkleRegular />}
          tooltip="Run the sketch (Ctrl+Enter)"
        >
          Run
        </FluentButton>
        <FluentButton
          onClick={onSave}
          busy={saving}
          icon={<SaveRegular />}
          tooltip="Save the sketch (Ctrl+S)"
        >
          Save
        </FluentButton>
        {/* A mode, not a command: it stays down while the canvas is placing
            sketches, and the Inspector's Scene section says what it does. */}
        <FluentButton
          appearance={scene ? 'secondary' : 'subtle'}
          aria-pressed={scene}
          onClick={() => onScene(!scene)}
          icon={<ShapesRegular />}
          tooltip={scene ? 'Back to painting' : 'Scene mode: place and move other sketches'}
        >
          Scene
        </FluentButton>

        <FluentDivider />

        <FluentTitleField
          value={name}
          onChange={(e) => onName(e.target.value)}
          aria-label="Sketch name"
          placeholder="Untitled"
        />

        <FluentToolbarSpacer />

        {dirty && <FluentBadge tone="warning">edited</FluentBadge>}
        {unsaved && <FluentBadge>unsaved</FluentBadge>}
      </FluentToolbar>
    </div>
  );
}
