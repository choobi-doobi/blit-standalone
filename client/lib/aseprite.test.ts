/**
 * The encoder is checked by READING the file back, against the format spec,
 * with a parser written here rather than reused from the encoder. The two
 * halves share no code and no constants on purpose: a round trip through one
 * person's idea of the layout proves only that they were consistent.
 *
 * The cel data is inflated with Node's `zlib`, not with the `DecompressionStream`
 * that mirrors the encoder's `CompressionStream`, so "is this really a zlib
 * stream" is answered by something that has never heard of this file.
 */
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

import { MAX_PALETTE, collectPalette, encodeAseprite, frameDuration } from './aseprite';

/** A frame of solid colours, as the renderer would hand one over. */
function frameOf(pixels: Array<[number, number, number, number]>): Uint8ClampedArray {
  const out = new Uint8ClampedArray(pixels.length * 4);
  pixels.forEach(([r, g, b, a], i) => out.set([r, g, b, a], i * 4));
  return out;
}

const RED: [number, number, number, number] = [228, 59, 68, 255];
const BLUE: [number, number, number, number] = [65, 166, 246, 255];
const CLEAR: [number, number, number, number] = [0, 0, 0, 0];

interface ParsedCel {
  w: number;
  h: number;
  pixels: Uint8Array;
}

interface Parsed {
  fileSize: number;
  actualSize: number;
  frames: number;
  w: number;
  h: number;
  depth: number;
  colorCount: number;
  transparentIndex: number;
  durations: number[];
  chunkTypes: number[][];
  palette: Array<[number, number, number, number]>;
  layerNames: string[];
  tags: Array<{ from: number; to: number; name: string }>;
  cels: ParsedCel[];
  /** Every frame header's byte count, measured against where the next one starts. */
  frameSpansAgree: boolean;
}

function parse(bytes: Uint8Array): Parsed {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = new TextDecoder();
  const out: Parsed = {
    fileSize: view.getUint32(0, true),
    actualSize: bytes.length,
    frames: view.getUint16(6, true),
    w: view.getUint16(8, true),
    h: view.getUint16(10, true),
    depth: view.getUint16(12, true),
    colorCount: view.getUint16(32, true),
    transparentIndex: bytes[28],
    durations: [],
    chunkTypes: [],
    palette: [],
    layerNames: [],
    tags: [],
    cels: [],
    frameSpansAgree: true,
  };
  expect(view.getUint16(4, true), 'file magic').toBe(0xa5e0);

  let at = 128;
  for (let f = 0; f < out.frames; f += 1) {
    const frameBytes = view.getUint32(at, true);
    expect(view.getUint16(at + 4, true), 'frame magic').toBe(0xf1fa);
    out.durations.push(view.getUint16(at + 8, true));
    const count = view.getUint32(at + 12, true) || view.getUint16(at + 6, true);

    let chunkAt = at + 16;
    const types: number[] = [];
    for (let c = 0; c < count; c += 1) {
      const size = view.getUint32(chunkAt, true);
      const type = view.getUint16(chunkAt + 4, true);
      types.push(type);
      const data = chunkAt + 6;

      if (type === 0x2019) {
        const entries = view.getUint32(data, true);
        let entryAt = data + 20;
        for (let e = 0; e < entries; e += 1) {
          const flags = view.getUint16(entryAt, true);
          out.palette.push([
            bytes[entryAt + 2],
            bytes[entryAt + 3],
            bytes[entryAt + 4],
            bytes[entryAt + 5],
          ]);
          entryAt += 6;
          if (flags & 1) entryAt += 2 + view.getUint16(entryAt, true);
        }
      } else if (type === 0x2004) {
        const nameLength = view.getUint16(data + 16, true);
        out.layerNames.push(text.decode(bytes.subarray(data + 18, data + 18 + nameLength)));
      } else if (type === 0x2018) {
        const tags = view.getUint16(data, true);
        let tagAt = data + 10;
        for (let t = 0; t < tags; t += 1) {
          const from = view.getUint16(tagAt, true);
          const to = view.getUint16(tagAt + 2, true);
          const nameLength = view.getUint16(tagAt + 17, true);
          out.tags.push({
            from,
            to,
            name: text.decode(bytes.subarray(tagAt + 19, tagAt + 19 + nameLength)),
          });
          tagAt += 19 + nameLength;
        }
      } else if (type === 0x2005) {
        expect(view.getUint16(data + 7, true), 'cel type').toBe(2);
        const celW = view.getUint16(data + 16, true);
        const celH = view.getUint16(data + 18, true);
        const compressed = bytes.subarray(data + 20, chunkAt + size);
        out.cels.push({ w: celW, h: celH, pixels: new Uint8Array(inflateSync(compressed)) });
      }

      chunkAt += size;
    }

    out.chunkTypes.push(types);
    if (chunkAt !== at + frameBytes) out.frameSpansAgree = false;
    at += frameBytes;
  }

  if (at !== bytes.length) out.frameSpansAgree = false;
  return out;
}

async function encode(options: Parameters<typeof encodeAseprite>[0]): Promise<Parsed> {
  const { blob } = await encodeAseprite(options);
  return parse(new Uint8Array(await blob.arrayBuffer()));
}

describe('the palette it decides on', () => {
  it('reserves index 0 for transparent, used or not', () => {
    expect(collectPalette([frameOf([RED, BLUE])])).toEqual([0, 0xe43b44ff, 0x41a6f6ff]);
  });

  it('counts every invisible pixel as the one transparent colour', () => {
    // An alpha-0 pixel may carry any rubbish in its RGB; counting those would
    // blow the palette on differences nobody can see.
    const palette = collectPalette([frameOf([CLEAR, [9, 9, 9, 0], [255, 0, 0, 0], RED])]);
    expect(palette).toEqual([0, 0xe43b44ff]);
  });

  it('keeps two colours that differ only in alpha, because Aseprite can hold both', () => {
    const palette = collectPalette([frameOf([[10, 20, 30, 255], [10, 20, 30, 128]])]);
    expect(palette).toHaveLength(3);
  });

  it('gives up past 256, which is what sends the file to RGBA', () => {
    const many: Array<[number, number, number, number]> = [];
    for (let i = 0; i < MAX_PALETTE; i += 1) many.push([i, 0, 0, 255]);
    expect(collectPalette([frameOf(many)])).toBeNull();
    expect(collectPalette([frameOf(many.slice(0, MAX_PALETTE - 1))])).toHaveLength(MAX_PALETTE);
  });
});

describe('an indexed sprite', () => {
  it('writes the sketch as indexed, with its own colours as the palette', async () => {
    const file = await encode({ frames: [frameOf([RED, BLUE, CLEAR, RED])], w: 2, h: 2, fps: 12 });
    expect(file.depth).toBe(8);
    expect(file.w).toBe(2);
    expect(file.h).toBe(2);
    expect(file.transparentIndex).toBe(0);
    expect(file.colorCount).toBe(3);
    expect(file.palette).toEqual([
      [0, 0, 0, 0],
      [228, 59, 68, 255],
      [65, 166, 246, 255],
    ]);
  });

  it('draws the pixels as indices into it', async () => {
    const file = await encode({ frames: [frameOf([RED, BLUE, CLEAR, RED])], w: 2, h: 2, fps: 12 });
    expect(Array.from(file.cels[0].pixels)).toEqual([1, 2, 0, 1]);
    expect([file.cels[0].w, file.cels[0].h]).toEqual([2, 2]);
  });

  it('round-trips to the exact colours it was given', async () => {
    const pixels: Array<[number, number, number, number]> = [RED, BLUE, CLEAR, [10, 20, 30, 128]];
    const file = await encode({ frames: [frameOf(pixels)], w: 2, h: 2, fps: 12 });
    const back = Array.from(file.cels[0].pixels).map((index) => file.palette[index]);
    // The transparent index comes back as a transparent pixel, not as the RGB
    // that happened to be under it.
    expect(back).toEqual([[...RED], [...BLUE], [0, 0, 0, 0], [10, 20, 30, 128]]);
  });
});

describe('an RGBA sprite', () => {
  const many: Array<[number, number, number, number]> = [];
  for (let i = 0; i < 300; i += 1) many.push([i % 256, (i * 7) % 256, i, 255]);

  it('falls back to 32 bits when the colours will not fit a palette', async () => {
    const file = await encode({ frames: [frameOf(many)], w: 300, h: 1, fps: 12 });
    expect(file.depth).toBe(32);
    expect(file.colorCount).toBe(0);
    expect(file.palette).toEqual([]);
    expect(file.chunkTypes[0]).not.toContain(0x2019);
  });

  it('writes the pixels through untouched, alpha and all', async () => {
    const file = await encode({ frames: [frameOf(many)], w: 300, h: 1, fps: 12 });
    expect(Array.from(file.cels[0].pixels)).toEqual(Array.from(frameOf(many)));
  });
});

describe('the sprite as a whole', () => {
  const three = [frameOf([RED]), frameOf([BLUE]), frameOf([CLEAR])];

  it('is one frame per frame, each with the sketch timing', async () => {
    const file = await encode({ frames: three, w: 1, h: 1, fps: 12 });
    expect(file.frames).toBe(3);
    expect(file.cels).toHaveLength(3);
    expect(file.durations).toEqual([83, 83, 83]);
    expect(frameDuration(12)).toBe(83);
    expect(frameDuration(1)).toBe(1000);
  });

  it('puts what describes the sprite on frame 0 and nothing but a cel after it', async () => {
    const file = await encode({ frames: three, w: 1, h: 1, fps: 12, name: 'Ship' });
    expect(file.chunkTypes[0]).toEqual([0x2007, 0x2019, 0x2004, 0x2018, 0x2005]);
    expect(file.chunkTypes[1]).toEqual([0x2005]);
    expect(file.layerNames).toEqual(['Ship']);
    expect(file.tags).toEqual([{ from: 0, to: 2, name: 'Ship' }]);
  });

  /**
   * The two counts a reader navigates by. Get either wrong and the file opens
   * as garbage or not at all, and no assertion about the pixels would notice,
   * because the pixels are fine.
   */
  it('agrees with itself about how long everything is', async () => {
    const file = await encode({ frames: three, w: 1, h: 1, fps: 12 });
    expect(file.fileSize).toBe(file.actualSize);
    expect(file.frameSpansAgree).toBe(true);
  });

  it('refuses a sprite with no frames rather than writing an empty one', async () => {
    await expect(encodeAseprite({ frames: [], w: 1, h: 1, fps: 12 })).rejects.toThrow(/at least one frame/);
  });

  it('names the layer and the tag Blit when the sketch has no name of its own', async () => {
    const file = await encode({ frames: [frameOf([RED])], w: 1, h: 1, fps: 12 });
    expect(file.layerNames).toEqual(['Blit']);
  });
});
