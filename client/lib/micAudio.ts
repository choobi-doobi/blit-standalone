/**
 * The microphone as a sketch's `audio` source: an analyser read once per frame
 * and turned into the same `AudioFrame` a sketch already knows how to read.
 */

import { SILENCE, toAudioFrame, type AudioFrame } from './blit/audio';

export interface Mic {
  read: () => AudioFrame;
  stop: () => void;
}

const BINS = 8;

export async function startMic(): Promise<Mic> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const ctx = new AudioContext();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const data = new Uint8Array(analyser.frequencyBinCount);
  const started = performance.now();
  let avg = 0;
  let lastBeat = -Infinity;

  return {
    read() {
      if (ctx.state === 'closed') return SILENCE;
      analyser.getByteFrequencyData(data);
      // Log-ish bands: low bins carry most of what a sketch wants to react to.
      const fft: number[] = [];
      for (let b = 0; b < BINS; b += 1) {
        const from = Math.floor((data.length * (2 ** b - 1)) / (2 ** BINS - 1));
        const to = Math.max(from + 1, Math.floor((data.length * (2 ** (b + 1) - 1)) / (2 ** BINS - 1)));
        let sum = 0;
        for (let i = from; i < to; i += 1) sum += data[i];
        fft.push(sum / (to - from) / 255);
      }
      const vol = fft.reduce((s, v) => s + v, 0) / BINS;
      const now = (performance.now() - started) / 1000;
      const beat = vol > 0.05 && vol > avg * 1.4 && now - lastBeat > 0.15;
      if (beat) lastBeat = now;
      avg = avg * 0.9 + vol * 0.1;
      return toAudioFrame({ fft, vol, beat, sinceBeat: now - lastBeat, playing: true, cycle: 0, cps: 0, haps: [] });
    },
    stop() {
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close();
    },
  };
}
