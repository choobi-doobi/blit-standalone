/**
 * An animated GIF encoder: the loop export.
 *
 * GIF over APNG because a GIF plays everywhere — chat apps, image viewers, issue
 * trackers — and an APNG quietly shows a still in half of them.
 *
 * The cost is GIF's limits: 256-entry colour tables and one bit of alpha.
 * - **Colour.** Up to 255 distinct opaque colours per frame (most
 *   pixel art) and the palette is exact. Past that, the colours are median-cut
 *   down to 255, so a `grad` or `noise` sketch exports close rather than exact.
 * - **Alpha.** A pixel is transparent below half alpha and opaque at or above
 *   it, keeping its colour. Index 0 is always the transparent entry.
 *
 * Every frame is full-size with disposal 2 (restore to background), so a pixel
 * that goes transparent really clears rather than showing the frame before.
 */

const TRANSPARENT = 0;
const MAX_COLORS = 255; // index 0 is transparent
const ALPHA_THRESHOLD = 128;

/** GIF delays are centiseconds. Under 2 most viewers treat as 10, so floor at 2. */
export function gifDelay(fps: number): number {
  const safe = Number.isFinite(fps) && fps >= 1 ? Math.min(60, fps) : 12;
  return Math.max(2, Math.min(0xffff, Math.round(100 / safe)));
}

type Frame = Uint8Array | Uint8ClampedArray;

const rgbAt = (f: Frame, at: number): number => (f[at] << 16) | (f[at + 1] << 8) | f[at + 2];

/** Median cut over weighted colours, down to at most `max` representative colours. */
function medianCut(counts: Map<number, number>, max: number): number[] {
  type Box = { colors: number[]; ch: number; range: number };
  const describe = (colors: number[]): Box => {
    let best = 0;
    let bestRange = -1;
    for (let ch = 0; ch < 3; ch += 1) {
      const shift = 16 - ch * 8;
      let lo = 255;
      let hi = 0;
      for (const c of colors) {
        const v = (c >> shift) & 0xff;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      if (hi - lo > bestRange) {
        bestRange = hi - lo;
        best = ch;
      }
    }
    return { colors, ch: best, range: bestRange };
  };

  const boxes: Box[] = [describe([...counts.keys()])];
  while (boxes.length < max) {
    let pick = -1;
    for (let i = 0; i < boxes.length; i += 1) {
      if (boxes[i].colors.length > 1 && (pick < 0 || boxes[i].range > boxes[pick].range)) pick = i;
    }
    if (pick < 0) break;
    const box = boxes[pick];
    const shift = 16 - box.ch * 8;
    const sorted = box.colors.sort((a, b) => ((a >> shift) & 0xff) - ((b >> shift) & 0xff));
    const total = sorted.reduce((sum, c) => sum + (counts.get(c) ?? 0), 0);
    let acc = 0;
    let cut = 1;
    for (let i = 0; i < sorted.length - 1; i += 1) {
      acc += counts.get(sorted[i]) ?? 0;
      cut = i + 1;
      if (acc >= total / 2) break;
    }
    boxes.splice(pick, 1, describe(sorted.slice(0, cut)), describe(sorted.slice(cut)));
  }

  return boxes.map(({ colors }) => {
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (const c of colors) {
      const w = counts.get(c) ?? 0;
      r += ((c >> 16) & 0xff) * w;
      g += ((c >> 8) & 0xff) * w;
      b += (c & 0xff) * w;
      n += w;
    }
    return (Math.round(r / n) << 16) | (Math.round(g / n) << 8) | Math.round(b / n);
  });
}

/**
 * The loop's palette (index 0 transparent) and a lookup from any opaque RGB to
 * its index. Exact when the loop fits; median-cut and nearest-match when not.
 */
export function buildPalette(frames: Frame[]): { palette: number[]; indexOf: (rgb: number) => number } {
  const counts = new Map<number, number>();
  for (const f of frames) {
    for (let at = 0; at < f.length; at += 4) {
      if (f[at + 3] < ALPHA_THRESHOLD) continue;
      const c = rgbAt(f, at);
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
  }

  const colors = counts.size <= MAX_COLORS ? [...counts.keys()] : medianCut(counts, MAX_COLORS);
  const palette = [0, ...colors];
  const exact = new Map(palette.slice(1).map((c, i) => [c, i + 1]));

  const indexOf = (rgb: number): number => {
    const hit = exact.get(rgb);
    if (hit !== undefined) return hit;
    let best = 1;
    let bestD = Infinity;
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = rgb & 0xff;
    for (let i = 1; i < palette.length; i += 1) {
      const p = palette[i];
      const dr = r - ((p >> 16) & 0xff);
      const dg = g - ((p >> 8) & 0xff);
      const db = b - (p & 0xff);
      const d = dr * dr * 2 + dg * dg * 4 + db * db * 3;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    exact.set(rgb, best); // memoise: pixel art repeats itself
    return best;
  };
  return { palette, indexOf };
}

/** LSB-first GIF LZW over palette indices. */
export function lzwEncode(indices: Uint8Array, minCodeSize: number): Uint8Array {
  const out: number[] = [];
  let cur = 0;
  let bits = 0;
  const clear = 1 << minCodeSize;
  const eoi = clear + 1;
  let codeSize = minCodeSize + 1;
  let next = eoi + 1;
  const dict = new Map<number, number>();

  const write = (code: number): void => {
    cur |= code << bits;
    bits += codeSize;
    while (bits >= 8) {
      out.push(cur & 0xff);
      cur >>>= 8;
      bits -= 8;
    }
  };

  write(clear);
  if (indices.length > 0) {
    let prefix = indices[0];
    for (let i = 1; i < indices.length; i += 1) {
      const k = indices[i];
      const key = (prefix << 8) | k;
      const found = dict.get(key);
      if (found !== undefined) {
        prefix = found;
        continue;
      }
      write(prefix);
      if (next < 4096) {
        dict.set(key, next);
        next += 1;
        if (next > 1 << codeSize && codeSize < 12) codeSize += 1;
      } else {
        write(clear);
        dict.clear();
        codeSize = minCodeSize + 1;
        next = eoi + 1;
      }
      prefix = k;
    }
    write(prefix);
  }
  write(eoi);
  if (bits > 0) out.push(cur & 0xff);
  return Uint8Array.from(out);
}

export interface GifOptions {
  frames: Frame[];
  w: number;
  h: number;
  fps: number;
}

class Bytes {
  private readonly data: number[] = [];
  push(...values: number[]): void { this.data.push(...values); }
  u16(value: number): void { this.push(value & 0xff, (value >> 8) & 0xff); }
  ascii(value: string): void {
    for (let i = 0; i < value.length; i += 1) this.push(value.charCodeAt(i));
  }
  finish(): Uint8Array { return Uint8Array.from(this.data); }
}

type Palette = ReturnType<typeof buildPalette>;

function tableBits(palette: number[]): number {
  let bits = 2; // GIF's minimum LZW code size
  while (1 << bits < palette.length) bits += 1;
  return bits;
}

function writeTable(bytes: Bytes, palette: number[]): void {
  for (let i = 0; i < 1 << tableBits(palette); i += 1) {
    const c = palette[i] ?? 0;
    bytes.push((c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff);
  }
}

function header(w: number, h: number, palette: number[]): Uint8Array {
  const bytes = new Bytes();
  const bits = tableBits(palette);
  bytes.ascii('GIF89a');
  bytes.u16(w);
  bytes.u16(h);
  bytes.push(0x80 | ((bits - 1) << 4) | (bits - 1), TRANSPARENT, 0);
  writeTable(bytes, palette);
  bytes.push(0x21, 0xff, 0x0b);
  bytes.ascii('NETSCAPE2.0');
  bytes.push(0x03, 0x01, 0x00, 0x00, 0x00); // loop forever
  return bytes.finish();
}

function encodeFrame(f: Frame, w: number, h: number, fps: number, colors: Palette, local: boolean): Uint8Array {
  if (f.length !== w * h * 4) throw new Error('GIF frame dimensions do not match its pixels.');
  const { palette, indexOf } = colors;
  const bits = tableBits(palette);
  const indices = new Uint8Array(w * h);
  for (let i = 0; i < indices.length; i += 1) {
    const at = i * 4;
    indices[i] = f[at + 3] < ALPHA_THRESHOLD ? TRANSPARENT : indexOf(rgbAt(f, at));
  }
  const bytes = new Bytes();
  // Restore to background between full frames, including transparent pixels.
  bytes.push(0x21, 0xf9, 0x04, (2 << 2) | 0x01);
  bytes.u16(gifDelay(fps));
  bytes.push(TRANSPARENT, 0x00, 0x2c);
  bytes.u16(0);
  bytes.u16(0);
  bytes.u16(w);
  bytes.u16(h);
  bytes.push(local ? 0x80 | (bits - 1) : 0x00);
  if (local) writeTable(bytes, palette);
  bytes.push(bits);
  const data = lzwEncode(indices, bits);
  for (let at = 0; at < data.length; at += 255) {
    const block = data.subarray(at, at + 255);
    bytes.push(block.length);
    for (let i = 0; i < block.length; i += 1) bytes.push(block[i]);
  }
  bytes.push(0x00);
  return bytes.finish();
}

export function encodeGif({ frames, w, h, fps }: GifOptions): Uint8Array {
  if (frames.length === 0) throw new Error('An animation needs at least one frame.');
  const colors = buildPalette(frames);
  const parts = [header(w, h, colors.palette), ...frames.map((f) => encodeFrame(f, w, h, fps, colors, false)), Uint8Array.of(0x3b)];
  const bytes = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let at = 0;
  for (const part of parts) { bytes.set(part, at); at += part.length; }
  return bytes;
}

/**
 * Consume each RGBA frame immediately; retain only compressed GIF blocks.
 * Local palettes avoid holding (or rendering twice) the entire loop just to
 * discover its colours. The tiny global table supplies disposal's background.
 */
export function createGifEncoder({ w, h, fps }: Omit<GifOptions, 'frames'>): {
  addFrame: (frame: Frame) => void;
  finish: () => Blob;
} {
  const parts: BlobPart[] = [header(w, h, [0]) as BlobPart];
  let count = 0;
  let finished = false;
  return {
    addFrame(frame) {
      if (finished) throw new Error('This GIF is already finished.');
      parts.push(encodeFrame(frame, w, h, fps, buildPalette([frame]), true) as BlobPart);
      count += 1;
    },
    finish() {
      if (finished) throw new Error('This GIF is already finished.');
      if (count === 0) throw new Error('An animation needs at least one frame.');
      finished = true;
      const blob = new Blob([...parts, Uint8Array.of(0x3b)], { type: 'image/gif' });
      parts.length = 0;
      return blob;
    },
  };
}
