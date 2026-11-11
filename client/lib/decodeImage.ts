/**
 * Getting a dropped or picked PNG to RGBA bytes.
 *
 * PNG only, and decoded by `@client/png-codec/pngDecode` rather than by the
 * browser. That is a correction, not a shortcut: the obvious route is
 * `createImageBitmap` and a 2D canvas, and it is WRONG for this job, because a
 * canvas stores colour premultiplied by alpha. A pixel of `#3b5dc980` goes in
 * and `#3c5ec980` comes back out — measured in Chrome, on the first browser run
 * of this feature. Fully opaque art survives that; anything with partial alpha
 * does not, and "the import is exact" is the promise the whole design rests on.
 *
 * Decoding the bytes directly also means there is no DOM on this path at all, so
 * it is tested like everything else rather than only in a browser.
 *
 * The cost is the format list: JPEG and WebP would need the canvas back. Neither
 * is a pixel-art interchange format, and refusing them plainly beats importing
 * them slightly wrong.
 *
 * The size this refuses at is the FILE limit, not the grid limit. Anything between
 * the two is a size the caller gets to pick, which is `resample.ts`' job and the
 * import route's; by the time bytes reach the decoder the only question left is
 * whether the file is readable at all.
 */

import { decodePng } from '../png-codec/pngDecode';

import { tooBigSourceReason, IMPORT_MAX_SOURCE } from './blit/importImage';

/** What the file picker offers, and the only type a drop is taken from. */
export const IMPORT_ACCEPT = 'image/png';

/** PNG's magic number. Checked by `pngSize`; the decoder checks it again itself. */
const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

export interface DecodedImage {
  data: Uint8ClampedArray<ArrayBuffer>;
  w: number;
  h: number;
  /** The file's name without its extension, for naming the sketch. */
  stem: string;
}

/** A file's name with the last extension removed, and nothing else changed. */
export function fileStem(name: string): string {
  const cut = name.lastIndexOf('.');
  const stem = cut > 0 ? name.slice(0, cut) : name;
  return stem.trim() || 'Imported';
}

/** Is this a file worth trying to decode? Type first, name when the type is blank. */
export function isPng(file: { name: string; type: string }): boolean {
  if (file.type) return file.type === 'image/png';
  return file.name.toLowerCase().endsWith('.png');
}

/**
 * A PNG's dimensions, read off its header without decoding it.
 *
 * IHDR is the first chunk a PNG is required to carry and its width and height are
 * the first two fields of it, so this is 24 bytes of work on a file that may be
 * four megabytes. That gap is the whole reason it exists: the size decides whether
 * the import can happen in this tab or has to go and ask for a size first, and
 * inflating a megapixel image to find that out is exactly the cost being avoided.
 *
 * Null for anything that is not a PNG, or is too short to say.
 */
export function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24) return null;
  for (let i = 0; i < SIGNATURE.length; i += 1) if (bytes[i] !== SIGNATURE[i]) return null;
  // Bytes 12..16 are the first chunk's type. A PNG whose first chunk is not IHDR
  // is malformed; say nothing rather than read a length as a width.
  if (String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]) !== 'IHDR') return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (width < 1 || height < 1) return null;
  return { width, height };
}

/**
 * Bytes as base64, for the one route that takes a whole file.
 *
 * Chunked because `btoa(String.fromCharCode(...bytes))` spreads every byte as an
 * argument and blows the call stack somewhere around a hundred kilobytes — which
 * is to say it works on every test fixture and fails on every real file.
 */
export function toBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let ascii = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    ascii += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(ascii);
}

/**
 * Decode PNG bytes to straight-alpha RGBA.
 *
 * Throws with a message meant to be shown: every failure here is something about
 * the file rather than a bug. The size is checked from the decoded dimensions
 * using `importImage`'s own wording, so the refusal reads the same whichever side
 * catches it.
 */
export async function decodePngBytes(bytes: Uint8Array, name: string): Promise<DecodedImage> {
  let decoded;
  try {
    decoded = await decodePng(bytes);
  } catch (error) {
    throw new Error(`Couldn't read ${name} as a PNG: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
  if (decoded.width > IMPORT_MAX_SOURCE || decoded.height > IMPORT_MAX_SOURCE) {
    throw new Error(tooBigSourceReason(decoded.width, decoded.height));
  }
  // A view over the decoder's own buffer: `Uint8ClampedArray` is what the rest of
  // the engine speaks, and there is nothing to copy.
  const data = new Uint8ClampedArray(
    decoded.data.buffer,
    decoded.data.byteOffset,
    decoded.data.byteLength,
  ) as Uint8ClampedArray<ArrayBuffer>;
  return { data, w: decoded.width, h: decoded.height, stem: fileStem(name) };
}

/** Read a picked or dropped file and decode it. */
export async function decodeImageFile(file: File): Promise<DecodedImage> {
  if (!isPng(file)) {
    throw new Error(`${file.name} is not a PNG. Blit imports PNG, which is the one format that survives the trip exactly.`);
  }
  return decodePngBytes(new Uint8Array(await file.arrayBuffer()), file.name);
}

/** The first PNG in a drop, or null when the drop carried none. */
export function imageFromDrop(transfer: DataTransfer | null): File | null {
  if (!transfer) return null;
  for (const file of Array.from(transfer.files ?? [])) {
    if (isPng(file)) return file;
  }
  return null;
}
