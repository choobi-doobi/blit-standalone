/**
 * An `.aseprite` encoder.
 *
 * A spritesheet is what you hand an engine and a GIF is what you show a
 * person. This is the third audience: the pixel artist who wants to keep
 * working. A sketch opens in Aseprite as a real sprite — one frame per frame of
 * the cycle, each with the sketch's own timing — rather than as a strip they
 * have to slice by hand.
 *
 * **No new dependency.** Aseprite's format is a 128-byte header, a header per
 * frame and a chain of typed chunks, and the only hard part is the same one the
 * PNG helpers already solved: the image data in a cel is a ZLIB stream, which
 * is exactly what `CompressionStream('deflate')` emits. Everything here is
 * little-endian, which is the one thing to remember when reading this beside
 * `png.ts` — PNG is big-endian and these two files disagree on purpose.
 *
 * ## Indexed when it fits, RGBA when it does not
 *
 * Blit is a palette language: characters map to colours, digits index a ramp,
 * and `.palShift()` cycles one. A hand-drawn sprite has six colours, and handing
 * that to Aseprite as 32-bit RGBA would throw away the one structure the artist
 * most wants to keep — the palette, which is what makes recolouring and palette
 * cycling possible over there too.
 *
 * So the colours are counted first. Up to 256 distinct ones and the file is
 * **Indexed**, with the sketch's exact colours as the sprite's palette and index
 * 0 reserved for transparent. Past that — `grad`, `noise`, a dithered plasma —
 * it is **RGBA**, because the alternative is quantising the sketch and an export
 * that does not look like what it exported is a strange thing to ship. Aseprite
 * converts RGB to Indexed itself in one menu item if that is what they want, and
 * it is a better quantiser than anything that belongs in here.
 *
 * Nothing about the choice is lossy in either direction: indexed files carry the
 * exact RGBA of every colour, including partial alpha, in the palette.
 */

import type { RgbaBuffer } from './blit/render';

const MAGIC_FILE = 0xa5e0;
const MAGIC_FRAME = 0xf1fa;

const CHUNK_LAYER = 0x2004;
const CHUNK_CEL = 0x2005;
const CHUNK_COLOR_PROFILE = 0x2007;
const CHUNK_TAGS = 0x2018;
const CHUNK_PALETTE = 0x2019;

/** Index 0 is transparent, so 255 colours are left for the art. */
export const MAX_PALETTE = 256;

/** A little-endian byte builder. Aseprite's whole format is little-endian. */
class Writer {
  private parts: Uint8Array[] = [];
  private size = 0;

  private push(bytes: Uint8Array): void {
    this.parts.push(bytes);
    this.size += bytes.length;
  }

  u8(value: number): void {
    this.push(new Uint8Array([value & 0xff]));
  }

  u16(value: number): void {
    const out = new Uint8Array(2);
    new DataView(out.buffer).setUint16(0, value & 0xffff, true);
    this.push(out);
  }

  i16(value: number): void {
    const out = new Uint8Array(2);
    new DataView(out.buffer).setInt16(0, value, true);
    this.push(out);
  }

  u32(value: number): void {
    const out = new Uint8Array(4);
    new DataView(out.buffer).setUint32(0, value >>> 0, true);
    this.push(out);
  }

  zeros(count: number): void {
    this.push(new Uint8Array(count));
  }

  bytes(value: Uint8Array): void {
    this.push(value);
  }

  /** Aseprite's STRING: a length in front, and the text as UTF-8. */
  string(value: string): void {
    const encoded = new TextEncoder().encode(value);
    this.u16(encoded.length);
    this.push(encoded);
  }

  get length(): number {
    return this.size;
  }

  done(): Uint8Array {
    const out = new Uint8Array(this.size);
    let at = 0;
    for (const part of this.parts) {
      out.set(part, at);
      at += part.length;
    }
    return out;
  }
}

/** A chunk: its own size (header included), its type, then its data. */
function chunk(type: number, data: Uint8Array): Uint8Array {
  const out = new Writer();
  out.u32(data.length + 6);
  out.u16(type);
  out.bytes(data);
  return out.done();
}

/** Pack one pixel of an RGBA buffer the way `Color` packs one. */
function packAt(frame: Uint8Array | Uint8ClampedArray, at: number): number {
  // A pixel you cannot see is the transparent colour whatever its channels say:
  // a decoder is free to leave anything in the RGB of an alpha-0 pixel, and
  // counting those as colours would blow the palette on invisible differences.
  if (frame[at + 3] === 0) return 0;
  return (
    ((frame[at] << 24) | (frame[at + 1] << 16) | (frame[at + 2] << 8) | frame[at + 3]) >>> 0
  );
}

/**
 * The sprite's palette, or null when there are too many colours for one.
 *
 * Index 0 is always the transparent entry, present whether or not the sketch
 * uses it: Aseprite's transparent index is a property of the sprite, and a file
 * whose index 0 was a real colour would lose that colour the moment anything was
 * erased.
 */
export function collectPalette(frames: Array<Uint8Array | Uint8ClampedArray>): number[] | null {
  const seen = new Map<number, number>([[0, 0]]);
  const colors: number[] = [0];
  for (const frame of frames) {
    for (let at = 0; at < frame.length; at += 4) {
      const packed = packAt(frame, at);
      if (seen.has(packed)) continue;
      if (colors.length >= MAX_PALETTE) return null;
      seen.set(packed, colors.length);
      colors.push(packed);
    }
  }
  return colors;
}

/** One frame as palette indices, one byte a pixel. */
function toIndexed(frame: Uint8Array | Uint8ClampedArray, palette: number[]): Uint8Array {
  const lookup = new Map(palette.map((color, index) => [color, index]));
  const out = new Uint8Array(frame.length / 4);
  for (let i = 0; i < out.length; i += 1) out[i] = lookup.get(packAt(frame, i * 4)) ?? 0;
  return out;
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Milliseconds a frame is held, as the format stores it. */
export function frameDuration(fps: number): number {
  const safe = Number.isFinite(fps) && fps >= 1 ? Math.min(60, fps) : 12;
  return Math.max(1, Math.min(0xffff, Math.round(1000 / safe)));
}

function colorProfileChunk(): Uint8Array {
  const out = new Writer();
  out.u16(1); // sRGB
  out.u16(0); // no fixed gamma
  out.u32(0); // the gamma, unused without the flag
  out.zeros(8);
  return chunk(CHUNK_COLOR_PROFILE, out.done());
}

function paletteChunk(palette: number[]): Uint8Array {
  const out = new Writer();
  out.u32(palette.length);
  out.u32(0); // first index this chunk sets
  out.u32(palette.length - 1); // last
  out.zeros(8);
  for (const color of palette) {
    out.u16(0); // no entry name
    out.u8((color >>> 24) & 0xff);
    out.u8((color >>> 16) & 0xff);
    out.u8((color >>> 8) & 0xff);
    out.u8(color & 0xff);
  }
  return chunk(CHUNK_PALETTE, out.done());
}

function layerChunk(name: string): Uint8Array {
  const out = new Writer();
  out.u16(1 | 2); // visible, editable
  out.u16(0); // a normal image layer
  out.u16(0); // child level
  out.u16(0); // default width, ignored by every reader including Aseprite
  out.u16(0); // default height, likewise
  out.u16(0); // blend mode: Normal
  out.u8(255); // opacity, valid because the file header sets flag 1
  out.zeros(3);
  out.string(name);
  return chunk(CHUNK_LAYER, out.done());
}

/**
 * One tag over the whole loop, so the timeline says what it is.
 *
 * The three deprecated colour bytes and the extra byte after them are written as
 * zero rather than skipped: they are part of the record whatever Aseprite does
 * with them now, and a reader that counts bytes would lose the tag name.
 */
function tagsChunk(name: string, frames: number): Uint8Array {
  const out = new Writer();
  out.u16(1); // one tag
  out.zeros(8);
  out.u16(0); // from frame
  out.u16(frames - 1); // to frame
  out.u8(0); // forward
  out.u16(0); // repeat: forever
  out.zeros(6);
  out.zeros(3); // the deprecated tag colour
  out.u8(0);
  out.string(name);
  return chunk(CHUNK_TAGS, out.done());
}

function celChunk(compressed: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Writer();
  out.u16(0); // layer index
  out.i16(0); // x
  out.i16(0); // y
  out.u8(255); // opacity
  out.u16(2); // a compressed image, which is the only kind worth writing
  out.i16(0); // z-index, and the five zeros after it are the pre-1.3 reserve
  out.zeros(5);
  out.u16(w);
  out.u16(h);
  out.bytes(compressed);
  return chunk(CHUNK_CEL, out.done());
}

export interface AsepriteOptions {
  frames: Array<Uint8Array | Uint8ClampedArray>;
  w: number;
  h: number;
  fps: number;
  /** Names the layer and the tag, so the sprite arrives saying what it is. */
  name?: string;
}

/** What the encoder decided, which the caller may want to report. */
export interface AsepriteResult {
  blob: Blob;
  /** Null in RGBA mode; otherwise the palette that was written. */
  palette: number[] | null;
}

export async function encodeAseprite({
  frames,
  w,
  h,
  fps,
  name = 'Blit',
}: AsepriteOptions): Promise<AsepriteResult> {
  if (frames.length === 0) throw new Error('A sprite needs at least one frame.');

  const palette = collectPalette(frames);
  const indexed = palette !== null;
  const duration = frameDuration(fps);

  const header = new Writer();
  header.u32(0); // the file size, patched in once it is known
  header.u16(MAGIC_FILE);
  header.u16(frames.length);
  header.u16(w);
  header.u16(h);
  header.u16(indexed ? 8 : 32); // bits per pixel
  header.u32(1); // flags: the layer opacity below is a real value
  header.u16(duration); // the deprecated speed field, kept honest anyway
  header.u32(0);
  header.u32(0);
  header.u8(0); // the transparent palette index
  header.zeros(3);
  header.u16(indexed ? palette.length : 0);
  header.u8(1); // pixel width
  header.u8(1); // pixel height
  header.i16(0); // grid x
  header.i16(0); // grid y
  header.u16(16); // grid width
  header.u16(16); // grid height
  header.zeros(84);

  const parts: Uint8Array[] = [header.done()];
  let total = header.length;

  for (let i = 0; i < frames.length; i += 1) {
    const pixels = indexed ? toIndexed(frames[i], palette) : new Uint8Array(frames[i]);
    const chunks: Uint8Array[] = [];
    if (i === 0) {
      // Everything about the sprite rather than about a frame goes on frame 0,
      // which is where Aseprite writes it and where a reader expects it.
      chunks.push(colorProfileChunk());
      if (indexed) chunks.push(paletteChunk(palette));
      chunks.push(layerChunk(name));
      chunks.push(tagsChunk(name, frames.length));
    }
    chunks.push(celChunk(await deflate(pixels), w, h));

    const body = chunks.reduce((sum, part) => sum + part.length, 0);
    const frameHeader = new Writer();
    frameHeader.u32(body + 16);
    frameHeader.u16(MAGIC_FRAME);
    frameHeader.u16(Math.min(0xffff, chunks.length)); // the old count
    frameHeader.u16(duration);
    frameHeader.zeros(2);
    frameHeader.u32(chunks.length); // the new count, which readers prefer

    parts.push(frameHeader.done(), ...chunks);
    total += body + 16;
  }

  new DataView(parts[0].buffer, parts[0].byteOffset).setUint32(0, total, true);

  return {
    blob: new Blob(parts as BlobPart[], { type: 'application/octet-stream' }),
    palette,
  };
}

export type { RgbaBuffer };
