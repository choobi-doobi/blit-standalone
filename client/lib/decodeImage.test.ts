/**
 * The decode path, which is only testable at all because it does not use a
 * canvas. That is the point of it: see the module's own header.
 */

import { describe, expect, it } from 'vitest';

import { chunk, crc32, filterScanlines } from './png';
import { IMPORT_MAX_SOURCE } from './blit/importImage';
import { decodePngBytes, fileStem, isPng, pngSize, toBase64 } from './decodeImage';

const SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

/** A single-frame RGBA PNG, built with the plugin's own encoder primitives. */
async function pngOf(rgba: number[], w: number, h: number): Promise<Uint8Array> {
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, w);
  view.setUint32(4, h);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  const raw = filterScanlines(new Uint8Array(rgba), w, h);
  const stream = new Blob([raw as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'));
  const idat = new Uint8Array(await new Response(stream).arrayBuffer());
  const parts = [SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

describe('decodePngBytes', () => {
  it('returns the exact bytes the file holds, alpha included', async () => {
    // The case that made this module stop using a canvas: a 2D canvas stores
    // colour premultiplied, so #3b5dc980 came back as #3c5ec980 in Chrome.
    const pixels = [0x3b, 0x5d, 0xc9, 0x80, 0xff, 0xff, 0xff, 0xff];
    const decoded = await decodePngBytes(await pngOf(pixels, 2, 1), 'two.png');
    expect([decoded.w, decoded.h]).toEqual([2, 1]);
    expect([...decoded.data]).toEqual(pixels);
  });

  it('keeps a fully transparent pixel transparent', async () => {
    const pixels = [0, 0, 0, 0, 1, 2, 3, 255];
    const decoded = await decodePngBytes(await pngOf(pixels, 2, 1), 'clear.png');
    expect([...decoded.data]).toEqual(pixels);
  });

  it('reads a file that is past the GRID limit but not the file limit', async () => {
    // The point of the two limits: 200 wide is more grid than a literal holds,
    // and is still a perfectly ordinary file to open and then choose a size for.
    const pixels = new Array(200 * 4).fill(255);
    const decoded = await decodePngBytes(await pngOf(pixels, 200, 1), 'wide.png');
    expect([decoded.w, decoded.h]).toEqual([200, 1]);
  });

  it('refuses an image past the FILE limit, in the importer\'s own words', async () => {
    const side = IMPORT_MAX_SOURCE + 1;
    const pixels = new Array(side * 4).fill(255);
    await expect(decodePngBytes(await pngOf(pixels, side, 1), 'huge.png')).rejects.toThrow(
      new RegExp(`${side}x1.*${IMPORT_MAX_SOURCE}`),
    );
  });

  it('names the file when the bytes are not a PNG', async () => {
    await expect(decodePngBytes(new Uint8Array([1, 2, 3, 4]), 'notes.txt')).rejects.toThrow(/notes\.txt/);
  });

  it('checks its own crc helper is the one the decoder agrees with', () => {
    // A failing chunk CRC would surface as "not a PNG" above and look like a
    // decoder bug, so pin the known answer here instead.
    expect(crc32(new Uint8Array([0x49, 0x45, 0x4e, 0x44])) >>> 0).toBe(0xae426082);
  });
});

describe('fileStem', () => {
  it('drops the last extension and nothing else', () => {
    expect(fileStem('ship.png')).toBe('ship');
    expect(fileStem('my.walk.cycle.png')).toBe('my.walk.cycle');
    expect(fileStem('noextension')).toBe('noextension');
  });

  it('never answers with an empty name', () => {
    expect(fileStem('.png')).toBe('.png');
    expect(fileStem('   ')).toBe('Imported');
  });
});

describe('isPng', () => {
  it('trusts the type when there is one', () => {
    expect(isPng({ name: 'a.jpg', type: 'image/png' })).toBe(true);
    expect(isPng({ name: 'a.png', type: 'image/jpeg' })).toBe(false);
  });

  it('falls back to the name when the type is blank, as it is on some drops', () => {
    expect(isPng({ name: 'a.PNG', type: '' })).toBe(true);
    expect(isPng({ name: 'a.webp', type: '' })).toBe(false);
  });
});

describe('pngSize', () => {
  it('reads the dimensions off the header, agreeing with a full decode', async () => {
    const bytes = await pngOf(new Array(6 * 4 * 3).fill(200), 6, 3);
    expect(pngSize(bytes)).toEqual({ width: 6, height: 3 });
    const decoded = await decodePngBytes(bytes, 'six.png');
    expect(pngSize(bytes)).toEqual({ width: decoded.w, height: decoded.h });
  });

  it('answers from the header alone, without the rest of the file being there', async () => {
    // The whole point: a 24-byte prefix of a four-megabyte PNG is enough. If this
    // ever needed the IDAT it would have stopped being a peek.
    const bytes = await pngOf(new Array(4 * 4).fill(1), 4, 1);
    expect(pngSize(bytes.subarray(0, 24))).toEqual({ width: 4, height: 1 });
  });

  it('is null for anything that is not a PNG saying its size', async () => {
    expect(pngSize(new Uint8Array([1, 2, 3, 4]))).toBeNull();
    expect(pngSize(new Uint8Array(40))).toBeNull();
    const bytes = await pngOf(new Array(4).fill(1), 1, 1);
    const notIhdr = bytes.slice();
    notIhdr[12] = 0x69; // 'i', so the first chunk is no longer IHDR
    expect(pngSize(notIhdr)).toBeNull();
  });
});

describe('toBase64', () => {
  it('round-trips through atob', () => {
    const bytes = new Uint8Array([0, 1, 127, 128, 255, 65, 66]);
    expect([...Uint8Array.from(atob(toBase64(bytes)), (c) => c.charCodeAt(0))]).toEqual([...bytes]);
  });

  it('survives a file bigger than the argument spread it replaced', () => {
    // 300k bytes: a `String.fromCharCode(...bytes)` on this throws
    // "Maximum call stack size exceeded", which is the bug this exists to avoid.
    const big = new Uint8Array(300_000);
    for (let i = 0; i < big.length; i += 1) big[i] = i % 256;
    const back = Uint8Array.from(atob(toBase64(big)), (c) => c.charCodeAt(0));
    expect(back.length).toBe(big.length);
    expect(back[299_999]).toBe(big[299_999]);
  });
});
