import { describe, expect, it } from 'vitest';

import { buildPalette, createGifEncoder, encodeGif, gifDelay, lzwEncode } from './gif';

/** Reference GIF LZW decoder, written from the spec, to round-trip the encoder. */
function lzwDecode(data: Uint8Array, minCodeSize: number, count: number): number[] {
  const clear = 1 << minCodeSize;
  const eoi = clear + 1;
  let codeSize = minCodeSize + 1;
  let table: number[][] = [];
  const reset = (): void => {
    table = [];
    for (let i = 0; i < clear; i += 1) table.push([i]);
    table.push([], []);
    codeSize = minCodeSize + 1;
  };
  reset();
  const out: number[] = [];
  let bitPos = 0;
  let prev: number[] | null = null;
  while (out.length <= count) {
    let code = 0;
    for (let i = 0; i < codeSize; i += 1) {
      const byte = data[(bitPos + i) >> 3];
      if (byte === undefined) throw new Error('ran out of data');
      code |= ((byte >> ((bitPos + i) & 7)) & 1) << i;
    }
    bitPos += codeSize;
    if (code === clear) {
      reset();
      prev = null;
      continue;
    }
    if (code === eoi) break;
    let entry: number[];
    if (code < table.length) entry = table[code];
    else if (code === table.length && prev) entry = [...prev, prev[0]];
    else throw new Error(`bad code ${code}`);
    out.push(...entry);
    if (prev && table.length < 4096) table.push([...prev, entry[0]]);
    if (table.length === 1 << codeSize && codeSize < 12) codeSize += 1;
    prev = entry;
  }
  return out;
}

/** Walk a GIF into its parts. */
function parseGif(bytes: Uint8Array) {
  expect(String.fromCharCode(...bytes.subarray(0, 6))).toBe('GIF89a');
  const w = bytes[6] | (bytes[7] << 8);
  const h = bytes[8] | (bytes[9] << 8);
  const packed = bytes[10];
  expect(packed & 0x80).toBe(0x80);
  const tableSize = 1 << ((packed & 7) + 1);
  const palette: number[] = [];
  let at = 13;
  for (let i = 0; i < tableSize; i += 1, at += 3) palette.push((bytes[at] << 16) | (bytes[at + 1] << 8) | bytes[at + 2]);
  let loops = false;
  const frames: Array<{ delay: number; disposal: number; transparent: number | null; pixels: number[]; palette: number[] }> = [];
  let gce = { delay: 0, disposal: 0, transparent: null as number | null };
  const subBlocks = (): Uint8Array => {
    const parts: number[] = [];
    while (bytes[at] !== 0) {
      const n = bytes[at];
      parts.push(...bytes.subarray(at + 1, at + 1 + n));
      at += n + 1;
    }
    at += 1;
    return Uint8Array.from(parts);
  };
  for (;;) {
    const tag = bytes[at];
    if (tag === 0x3b) break;
    if (tag === 0x21) {
      const label = bytes[at + 1];
      at += 2;
      const body = subBlocks();
      if (label === 0xf9) {
        gce = {
          disposal: (body[0] >> 2) & 7,
          delay: body[1] | (body[2] << 8),
          transparent: body[0] & 1 ? body[3] : null,
        };
      } else if (label === 0xff && String.fromCharCode(...body.subarray(0, 11)) === 'NETSCAPE2.0') {
        loops = body[12] === 0 && body[13] === 0;
      }
    } else if (tag === 0x2c) {
      const local = bytes[at + 9];
      expect(local & 0x40).toBe(0); // not interlaced
      const fw = bytes[at + 5] | (bytes[at + 6] << 8);
      const fh = bytes[at + 7] | (bytes[at + 8] << 8);
      expect([fw, fh]).toEqual([w, h]);
      at += 10;
      let framePalette = palette;
      if (local & 0x80) {
        framePalette = [];
        for (let i = 0; i < 1 << ((local & 7) + 1); i += 1, at += 3) {
          framePalette.push((bytes[at] << 16) | (bytes[at + 1] << 8) | bytes[at + 2]);
        }
      }
      const min = bytes[at++];
      const pixels = lzwDecode(subBlocks(), min, w * h);
      expect(pixels.length).toBe(w * h);
      frames.push({ ...gce, pixels, palette: framePalette });
    } else {
      throw new Error(`unexpected block 0x${tag.toString(16)} at ${at}`);
    }
  }
  return { w, h, palette, loops, frames };
}

const px = (r: number, g: number, b: number, a = 255) => [r, g, b, a];

describe('gifDelay', () => {
  it('is centiseconds, floored at 2 because viewers slow anything faster', () => {
    expect(gifDelay(10)).toBe(10);
    expect(gifDelay(12)).toBe(8);
    expect(gifDelay(60)).toBe(2);
    expect(gifDelay(1)).toBe(100);
    for (const fps of [0, Number.NaN, -3]) expect(gifDelay(fps)).toBe(8);
  });
});

describe('lzwEncode', () => {
  it('round-trips short, long and table-overflowing inputs', () => {
    let seed = 7;
    const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff);
    const cases: Array<[number, Uint8Array]> = [
      [2, Uint8Array.from([1])],
      [2, new Uint8Array(1000)],
      [8, Uint8Array.from({ length: 50_000 }, () => rand() % 256)],
      [4, Uint8Array.from({ length: 20_000 }, (_, i) => (i * 7 + (i >> 5)) % 16)],
    ];
    for (const [min, input] of cases) {
      expect(lzwDecode(lzwEncode(input, min), min, input.length)).toEqual([...input]);
    }
  });
});

describe('buildPalette', () => {
  it('is exact when the loop fits in 255 colours', () => {
    const frame = Uint8ClampedArray.from([...px(10, 20, 30), ...px(40, 50, 60), ...px(10, 20, 30)]);
    const { palette, indexOf } = buildPalette([frame]);
    expect(palette).toEqual([0, 0x0a141e, 0x28323c]);
    expect(indexOf(0x28323c)).toBe(2);
  });

  it('cuts a many-colour loop to 255 entries plus transparent', () => {
    const frame = new Uint8ClampedArray(4096 * 4);
    for (let i = 0; i < 4096; i += 1) frame.set(px(i & 0xff, (i >> 4) & 0xff, (i * 3) & 0xff), i * 4);
    const { palette, indexOf } = buildPalette([frame]);
    expect(palette.length).toBe(256);
    const idx = indexOf(0x123456);
    expect(idx).toBeGreaterThanOrEqual(1);
    expect(idx).toBeLessThan(256);
  });
});

describe('encodeGif', () => {
  const red = px(255, 0, 0);
  const blue = px(0, 0, 255);
  const clear = px(9, 9, 9, 0);
  const half = px(0, 255, 0, 200);
  const faint = px(0, 255, 0, 40);

  it('writes a looping GIF89a with every frame, its delay and its pixels', () => {
    const a = Uint8ClampedArray.from([...red, ...blue, ...clear, ...half]);
    const b = Uint8ClampedArray.from([...blue, ...clear, ...faint, ...red]);
    const gif = parseGif(encodeGif({ frames: [a, b], w: 2, h: 2, fps: 10 }));

    expect([gif.w, gif.h]).toEqual([2, 2]);
    expect(gif.loops).toBe(true);
    expect(gif.frames).toHaveLength(2);
    const colour = (i: number | undefined) => (i === 0 ? 'clear' : gif.palette[i ?? -1]);
    for (const f of gif.frames) {
      expect(f.delay).toBe(10);
      expect(f.disposal).toBe(2); // clear between frames, so transparency is real
      expect(f.transparent).toBe(0);
    }
    expect(gif.frames[0].pixels.map(colour)).toEqual([0xff0000, 0x0000ff, 'clear', 0x00ff00]);
    expect(gif.frames[1].pixels.map(colour)).toEqual([0x0000ff, 'clear', 'clear', 0xff0000]);
  });

  it('handles a frame bigger than one LZW table', () => {
    const w = 64;
    const h = 64;
    const frame = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i += 1) frame.set(px((i * 37) & 0xff, (i * 11) & 0xff, (i >> 4) & 0xff), i * 4);
    const gif = parseGif(encodeGif({ frames: [frame], w, h, fps: 12 }));
    expect(gif.frames[0].pixels).toHaveLength(w * h);
  });

  it('refuses an empty animation', () => {
    expect(() => encodeGif({ frames: [], w: 1, h: 1, fps: 12 })).toThrow();
  });
});


describe('createGifEncoder', () => {
  it('consumes reused frame pixels immediately, preserving later colours, clearing and timing', async () => {
    const encoder = createGifEncoder({ w: 2, h: 1, fps: 10 });
    const pixels = Uint8ClampedArray.from([...px(255, 0, 0), ...px(0, 0, 255)]);
    encoder.addFrame(pixels);
    pixels.set([...px(0, 255, 0), ...px(0, 0, 0, 0)]);
    encoder.addFrame(pixels);
    pixels.fill(0); // discarded RGBA must not change the already encoded frames
    const blob = encoder.finish();
    expect(blob.type).toBe('image/gif');
    const gif = parseGif(new Uint8Array(await blob.arrayBuffer()));
    expect([gif.w, gif.h, gif.loops]).toEqual([2, 1, true]);
    expect(gif.frames.map((f) => f.pixels.map((i) => i === 0 ? 'clear' : f.palette[i])))
      .toEqual([[0xff0000, 0x0000ff], [0x00ff00, 'clear']]);
    for (const frame of gif.frames) {
      expect([frame.delay, frame.disposal, frame.transparent]).toEqual([10, 2, 0]);
    }
  });
});
