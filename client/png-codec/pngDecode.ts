/**
 * `@client/png-codec/pngDecode` — pure, dependency-free PNG DECODER.
 *
 * The single home for what were three near-identical copies:
 * `plugin-src/{forge,studio,icon-composer}/client/lib/pngDecode.ts`, none of
 * which had a test. They differed only in a dead local and in studio returning
 * `Uint8ClampedArray` (it feeds canvas `ImageData`) — this returns `Uint8Array`
 * and studio wraps it in a zero-copy view at its own boundary.
 *
 * Why decode PNGs by hand at all: a browser could go through
 * `createImageBitmap`/canvas, but that path does not exist under vitest (node),
 * so anything built on it is untestable outside a real browser. Decoding the
 * bytes directly keeps callers (forge's `.ora` importer, studio's and
 * icon-composer's server-side renderers) DOM-free and unit-testable — which is
 * also why this module runs unchanged on both sides of a plugin.
 *
 * Supports the real-world subset these tools produce and consume:
 *   - bit depth 8 (16-bit samples are truncated to their high byte), plus
 *     sub-8-bit (1/2/4) grayscale and indexed;
 *   - color types 0 (grayscale), 2 (RGB), 3 (indexed+PLTE/tRNS), 4 (gray+alpha),
 *     6 (RGBA);
 *   - all five scanline filters (None/Sub/Up/Average/Paeth);
 *   - a `tRNS` chunk (palette alpha, or a single transparent gray/RGB key).
 * Interlaced (Adam7) PNGs are REJECTED rather than mis-decoded — they are
 * effectively never used by the pixel-art tools that write these files, and a
 * scrambled image is a worse outcome than a clear error.
 *
 * IDAT is a zlib (RFC-1950) stream, inflated via DecompressionStream('deflate')
 * — the same platform primitive the encoders deflate with.
 */


/** A decoded image: straight-alpha RGBA bytes (length width*height*4). */
export interface DecodedPng {
  width: number;
  height: number;
  /** Row-major RGBA, 4 bytes per pixel, 0..255. */
  data: Uint8Array;
}

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

function concatBytes(parts: Uint8Array[]): Uint8Array {
  let len = 0;
  for (const p of parts) len += p.length;
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Inflate a zlib (RFC-1950) stream (a PNG IDAT). */
async function zlibInflate(bytes: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate');
  const writer = ds.writable.getWriter();
  // `as BufferSource`: a Uint8Array's .buffer is ArrayBufferLike (it could be a
  // SharedArrayBuffer), which the DOM stream types don't accept. The bytes here
  // never come from shared memory, so the cast is safe — and it is why studio's
  // fork of this code carried the same one.
  void writer.write(bytes as BufferSource);
  void writer.close();
  const reader = ds.readable.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return concatBytes(chunks);
}

/** Paeth predictor (PNG filter type 4). */
function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/** Channels per pixel for a PNG color type. */
function channelsForColorType(colorType: number): number {
  switch (colorType) {
    case 0: return 1; // grayscale
    case 2: return 3; // RGB
    case 3: return 1; // indexed
    case 4: return 2; // gray + alpha
    case 6: return 4; // RGBA
    default: throw new Error(`Unsupported PNG color type ${colorType}`);
  }
}

/**
 * Decode PNG bytes to straight-alpha RGBA. Throws on a non-PNG signature, an
 * interlaced image, or an unsupported color type.
 */
export async function decodePng(bytes: Uint8Array): Promise<DecodedPng> {
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== SIGNATURE[i]) throw new Error('Not a PNG (bad signature)');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  let width = 0;
  let height = 0;
  let bitDepth = 8;
  let colorType = 6;
  let interlace = 0;
  let palette: [number, number, number][] = [];
  let paletteAlpha: number[] = [];
  let transGray = -1;
  let transRgb: [number, number, number] | null = null;
  const idatParts: Uint8Array[] = [];

  let o = 8;
  while (o + 8 <= bytes.byteLength) {
    const len = view.getUint32(o, false);
    const type =
      String.fromCharCode(bytes[o + 4]) +
      String.fromCharCode(bytes[o + 5]) +
      String.fromCharCode(bytes[o + 6]) +
      String.fromCharCode(bytes[o + 7]);
    const dataStart = o + 8;
    const data = bytes.subarray(dataStart, dataStart + len);
    if (type === 'IHDR') {
      width = view.getUint32(dataStart, false);
      height = view.getUint32(dataStart + 4, false);
      bitDepth = bytes[dataStart + 8];
      colorType = bytes[dataStart + 9];
      interlace = bytes[dataStart + 12];
    } else if (type === 'PLTE') {
      palette = [];
      for (let i = 0; i + 2 < len; i += 3) palette.push([data[i], data[i + 1], data[i + 2]]);
    } else if (type === 'tRNS') {
      if (colorType === 3) {
        paletteAlpha = Array.from(data);
      } else if (colorType === 0) {
        transGray = view.getUint16(dataStart, false);
      } else if (colorType === 2) {
        transRgb = [view.getUint16(dataStart, false), view.getUint16(dataStart + 2, false), view.getUint16(dataStart + 4, false)];
      }
    } else if (type === 'IDAT') {
      idatParts.push(data.slice());
    } else if (type === 'IEND') {
      break;
    }
    o = dataStart + len + 4; // skip data + CRC
  }

  if (width <= 0 || height <= 0) throw new Error('PNG has no IHDR / zero dimensions');
  if (interlace !== 0) throw new Error('Interlaced PNGs are not supported');

  const channels = channelsForColorType(colorType);
  const raw = await zlibInflate(concatBytes(idatParts));

  // Sub-8-bit indexed/grayscale is unpacked bit-wise in readSample below; for
  // the common 8/16-bit case this rounds up to whole bytes per pixel, which is
  // what the unfilter step needs as its left-neighbour stride.
  const bitsPerPixel = channels * bitDepth;
  const bytesPerPixel = Math.max(1, Math.ceil(bitsPerPixel / 8));
  const rowBytes = Math.ceil((width * bitsPerPixel) / 8);

  // ── Unfilter each scanline in place ──────────────────────────────────────────
  const unfiltered = new Uint8Array(height * rowBytes);
  let ri = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[ri++];
    const rowStart = y * rowBytes;
    const prevStart = (y - 1) * rowBytes;
    for (let x = 0; x < rowBytes; x++) {
      const rawByte = raw[ri++] ?? 0;
      const a = x >= bytesPerPixel ? unfiltered[rowStart + x - bytesPerPixel] : 0;
      const b = y > 0 ? unfiltered[prevStart + x] : 0;
      const c = y > 0 && x >= bytesPerPixel ? unfiltered[prevStart + x - bytesPerPixel] : 0;
      let val: number;
      switch (filter) {
        case 0: val = rawByte; break;
        case 1: val = rawByte + a; break;
        case 2: val = rawByte + b; break;
        case 3: val = rawByte + ((a + b) >> 1); break;
        case 4: val = rawByte + paeth(a, b, c); break;
        default: val = rawByte; break;
      }
      unfiltered[rowStart + x] = val & 0xff;
    }
  }

  // ── Expand to RGBA ───────────────────────────────────────────────────────────
  const out = new Uint8Array(width * height * 4);

  /** Read sample `s` of pixel (x) on row `rowStart`, reduced to 0..255. */
  const readSample = (rowStart: number, x: number, s: number): number => {
    if (bitDepth === 8) return unfiltered[rowStart + x * channels + s];
    if (bitDepth === 16) return unfiltered[rowStart + (x * channels + s) * 2]; // high byte
    // sub-8-bit (1/2/4) — only meaningful for grayscale/indexed (channels === 1).
    const bitPos = x * bitsPerPixel + s * bitDepth;
    const byte = unfiltered[rowStart + (bitPos >> 3)];
    const shift = 8 - bitDepth - (bitPos & 7);
    const mask = (1 << bitDepth) - 1;
    const v = (byte >> shift) & mask;
    return colorType === 3 ? v : Math.round((v * 255) / mask); // index stays raw; gray scales
  };

  for (let y = 0; y < height; y++) {
    const rowStart = y * rowBytes;
    for (let x = 0; x < width; x++) {
      const oo = (y * width + x) * 4;
      if (colorType === 6) {
        out[oo] = readSample(rowStart, x, 0);
        out[oo + 1] = readSample(rowStart, x, 1);
        out[oo + 2] = readSample(rowStart, x, 2);
        out[oo + 3] = readSample(rowStart, x, 3);
      } else if (colorType === 2) {
        const r = readSample(rowStart, x, 0);
        const g = readSample(rowStart, x, 1);
        const b = readSample(rowStart, x, 2);
        out[oo] = r; out[oo + 1] = g; out[oo + 2] = b;
        out[oo + 3] = transRgb && r === transRgb[0] && g === transRgb[1] && b === transRgb[2] ? 0 : 255;
      } else if (colorType === 3) {
        const idx = readSample(rowStart, x, 0);
        const c = palette[idx] ?? [0, 0, 0];
        out[oo] = c[0]; out[oo + 1] = c[1]; out[oo + 2] = c[2];
        out[oo + 3] = idx < paletteAlpha.length ? paletteAlpha[idx] : 255;
      } else if (colorType === 0) {
        const g = readSample(rowStart, x, 0);
        out[oo] = g; out[oo + 1] = g; out[oo + 2] = g;
        out[oo + 3] = transGray >= 0 && g === (transGray & 0xff) ? 0 : 255;
      } else if (colorType === 4) {
        const g = readSample(rowStart, x, 0);
        const a = readSample(rowStart, x, 1);
        out[oo] = g; out[oo + 1] = g; out[oo + 2] = g; out[oo + 3] = a;
      }
    }
  }

  return { width, height, data: out };
}
