/**
 * What a sketch knows about the music.
 *
 * Two halves, and the split is the whole design. The CONTINUOUS half (`fft`,
 * `vol`, `bass`, `mid`, `treble`) is an analyser's view of the signal. The
 * DISCRETE half (`haps`) is what is actually sounding right now: the events, not
 * a picture of them. A shader toolkit would hand a sketch the other program's
 * rendered PIXELS, because a shader's job is to filter an image. Blit composes
 * its own pixels out of an algebra, so pixels are not the useful thing to hand
 * it; the note names and gains are, because those are what a sprite can be a
 * function of.
 *
 * Every field is frozen and the default is `SILENCE`. That is the property the
 * whole feature rests on: a sketch that never names `audio` cannot observe that
 * this field arrived, so every stored sketch renders byte for byte what it
 * rendered before.
 *
 * This module imports nothing. It sits below `pattern.ts` so that `render.ts`
 * can reach `SILENCE` without either file importing the other.
 */

/** One sounding event, narrowed to what a picture can be a function of. */
export interface AudioHap {
  /** Sound or instrument name. `''` when the event names none. */
  readonly s: string;
  /** MIDI note number, or null when the event is not pitched. */
  readonly note: number | null;
  /** Amplitude the event declared, 1 when it declared none. */
  readonly gain: number;
  /** Onset and end, in absolute cycles on the transport clock. */
  readonly begin: number;
  readonly end: number;
}

/**
 * The wire form: exactly what a producer sends.
 *
 * Deliberately NARROWER than `AudioFrame`. `bass`, `mid` and `treble` are
 * derived from `fft` on this side (see `toAudioFrame`), so a producer and this
 * engine cannot end up disagreeing about what "bass" means by each computing it
 * from a different rule.
 */
export interface AudioSignal {
  /** Per-bin level, after the producer's own cutoff and scale. */
  readonly fft: readonly number[];
  /** Total loudness of the latest analyser frame. */
  readonly vol: number;
  /**
   * An onset happened SINCE THE PREVIOUS FRAME THIS CONSUMER WAS GIVEN.
   *
   * Not "since the last analyser tick". A sketch running at `fps(12)` under a
   * 60Hz driver collapses five driver frames into one render, so an unlatched
   * flag would drop four onsets in five and the sketch would read as broken
   * rather than late. Latching is the producer's job and this is where it is
   * written down.
   */
  readonly beat: boolean;
  /** Seconds since the last onset. 0 on the frame `beat` is true, Infinity before the first. */
  readonly sinceBeat: number;
  /** Transport position, in cycles. */
  readonly cycle: number;
  /** Cycles per second. There is no BPM anywhere on this path. */
  readonly cps: number;
  /** True while the transport is running. */
  readonly playing: boolean;
  /** The events sounding at `cycle`, in onset order. */
  readonly haps: readonly AudioHap[];
}

/** What a sketch sees: the wire signal plus the three band shorthands. */
export interface AudioFrame extends AudioSignal {
  /** The lowest bin. */
  readonly bass: number;
  /** The mean of the bins between the lowest and the highest. */
  readonly mid: number;
  /** The highest bin. */
  readonly treble: number;
}

/**
 * No music. The default for every render that does not supply one.
 *
 * Deep frozen, and shared. A sketch body compiles in strict mode, so
 * `a.vol = 1` inside a sketch throws a TypeError and surfaces as an ordinary
 * run-phase error, instead of silently changing the default for every other
 * render in the tab.
 */
export const SILENCE: AudioFrame = Object.freeze({
  fft: Object.freeze([0, 0, 0, 0]) as readonly number[],
  vol: 0,
  bass: 0,
  mid: 0,
  treble: 0,
  beat: false,
  sinceBeat: Infinity,
  cycle: 0,
  cps: 0,
  playing: false,
  haps: Object.freeze([]) as readonly AudioHap[],
});

/**
 * A runaway pattern must not be able to make a render allocate without bound,
 * and nothing legible comes of drawing a three hundredth simultaneous note.
 */
export const MAX_AUDIO_HAPS = 256;

/**
 * A finite number, or the fallback.
 *
 * `Number.isFinite` does not coerce, so `'3'` is not a number here and neither
 * is `Infinity`. The one field whose silent value IS infinite (`sinceBeat`)
 * therefore round-trips through its own fallback, which lands on the same
 * value it started from.
 */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readHap(value: unknown): AudioHap | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  const begin = finite(raw.begin, 0);
  return Object.freeze({
    s: typeof raw.s === 'string' ? raw.s : '',
    note: typeof raw.note === 'number' && Number.isFinite(raw.note) ? raw.note : null,
    gain: finite(raw.gain, 1),
    begin,
    // Never behind `begin`. NaN, a string and Infinity all fall back to
    // `begin` already; a finite `end` SMALLER than it is the one shape that
    // survives the guard, and `end - begin` is then negative in every sketch
    // that asks how long a note is held.
    end: Math.max(begin, finite(raw.end, begin)),
  });
}

/**
 * Lift whatever arrived into the frame a sketch reads.
 *
 * TOTAL, and it never throws. The input comes from another program across a
 * message boundary, so it is validated rather than trusted: a throw here would
 * stop the picture inside a render loop, where there is nowhere to report it.
 *
 * One rule, applied to every field including `fft`: anything unusable falls back
 * to `SILENCE`'s value for that field. So an object carrying nothing usable
 * answers a frame equal to silence, and a non-object answers the `SILENCE`
 * singleton itself.
 */
export function toAudioFrame(signal: unknown): AudioFrame {
  if (typeof signal !== 'object' || signal === null || Array.isArray(signal)) return SILENCE;
  const raw = signal as Record<string, unknown>;

  const fft: readonly number[] = Object.freeze(
    Array.isArray(raw.fft)
      ? raw.fft.map((v) => finite(v, 0))
      : SILENCE.fft.slice(),
  );

  // The bands are read off the bins rather than off the message, so the two
  // sides of the seam cannot disagree about what the words mean.
  const bass = fft.length > 0 ? fft[0] : 0;
  const treble = fft.length > 0 ? fft[fft.length - 1] : 0;
  let mid = bass;
  if (fft.length >= 3) {
    const inner = fft.slice(1, -1);
    mid = inner.reduce((sum, v) => sum + v, 0) / inner.length;
  }

  const haps: AudioHap[] = [];
  if (Array.isArray(raw.haps)) {
    for (const entry of raw.haps) {
      if (haps.length >= MAX_AUDIO_HAPS) break;
      const hap = readHap(entry);
      if (hap !== null) haps.push(hap);
    }
  }

  return Object.freeze({
    fft,
    vol: finite(raw.vol, SILENCE.vol),
    bass,
    mid,
    treble,
    // Identity, not truthiness: the string 'false' is a true value in JavaScript
    // and a producer sending one has a bug, not a beat.
    beat: raw.beat === true,
    sinceBeat: finite(raw.sinceBeat, SILENCE.sinceBeat),
    cycle: finite(raw.cycle, SILENCE.cycle),
    cps: finite(raw.cps, SILENCE.cps),
    playing: raw.playing === true,
    haps: Object.freeze(haps) as readonly AudioHap[],
  });
}
