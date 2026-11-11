/**
 * `POST /api/blit/import` — a PNG in, sprite source out.
 *
 * The one route that does real work on pixels, and it exists because of a gap
 * between two numbers. A sprite literal is one character per pixel, so the grid
 * stops at 128 and always will. Pixel art, though, is shared at a multiple of the
 * size it was drawn at: the 32x32 comes back as a 512x512 PNG. Refusing that file
 * refuses the common case for a reason that is about the grid, not the picture.
 *
 * So anything over the grid limit gets a size CHOSEN for it, and this is where
 * the choosing is paid for. `resample.ts` explains why the resize is
 * nearest-neighbour and nothing else; the short version is that an averaging
 * filter invents colours that were never in the file, which would break the
 * exactness the importer is built on and blow the colour cap on the way.
 *
 * ### Why the answer is 200 even when there is no sprite
 *
 * "That size has 4213 colours" is not an error, it is the measurement the caller
 * asked for, and the useful part of the answer travels with it: `options` carries
 * every size this image could be imported at and the colour count at each. An
 * AppError would throw that away and leave the next attempt to guesswork. So a
 * refusal is `refusal` plus `options`, and only a bad request (not a PNG, past
 * the file limit, a nonsense size) is a 4xx.
 *
 * ### What it does not do
 *
 * Nothing here evaluates anything. It decodes, it picks pixels, and it emits
 * text. It does not so much as parse the source it writes.
 */

import { Router, type Request, type Response } from 'express';
import { AppError, asyncHandler } from '../http.js';

import { IMPORT_MAX_SIDE, importRgba, sketchSource } from '../../client/lib/blit/importImage.js';
import { downscaleOptions, fitted, resampleNearest } from '../../client/lib/blit/resample.js';
import { decodePngBytes } from '../../client/lib/decodeImage.js';

/**
 * The largest PNG this will take, in bytes.
 *
 * A bound on work, not a format rule: `IMPORT_MAX_SOURCE` already caps the
 * dimensions, and 1024x1024 of incompressible noise is about 4MB, so 12 leaves
 * room for a badly written encoder without leaving the door open.
 */
export const PNG_MAX_BYTES = 12_000_000;

/** Base64 carries 3 bytes per 4 characters, so the string is a third bigger. */
const BASE64_MAX_CHARS = Math.ceil(PNG_MAX_BYTES / 3) * 4 + 64;

const DATA_URL = /^data:image\/png;base64,/;

/** The PNG bytes, from base64, with a data URL prefix accepted and dropped. */
export function validatePng(value: unknown): Uint8Array {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new AppError(400, 'An import needs a PNG, base64 encoded, in `png`');
  }
  const body = value.replace(DATA_URL, '').trim();
  if (body.length > BASE64_MAX_CHARS) {
    throw new AppError(400, `A PNG is at most ${Math.round(PNG_MAX_BYTES / 1_000_000)}MB`);
  }
  const bytes = new Uint8Array(Buffer.from(body, 'base64'));
  // Buffer.from is lenient about base64 and answers a short buffer rather than
  // throwing, so the length is the only signal that the string was not what it
  // claimed. The decoder's signature check catches the rest.
  if (bytes.length < 24) throw new AppError(400, 'That is not a PNG: too few bytes to carry a header');
  if (bytes.length > PNG_MAX_BYTES) {
    throw new AppError(400, `That PNG is ${(bytes.length / 1_000_000).toFixed(1)}MB, over the ${Math.round(PNG_MAX_BYTES / 1_000_000)}MB limit`);
  }
  return bytes;
}

/** The longest side to emit, or null for "do not resize". */
export function validateSize(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new AppError(400, '`size` is the longest side of the grid to emit, as a whole number');
  }
  if (value < 1 || value > IMPORT_MAX_SIDE) {
    throw new AppError(400, `\`size\` is between 1 and ${IMPORT_MAX_SIDE}`);
  }
  return value;
}

/**
 * Decode, answering 400 rather than 500 for a file that is the caller's problem.
 *
 * `decodePngBytes` throws a plain `Error` because it was written for the browser,
 * where every one of its failures is something to show a person: bad signature,
 * interlaced, past the file limit. Over HTTP a plain Error is a 500, which would
 * log a malformed upload as a fault of this server and tell the caller nothing.
 * The messages are already written for a person, so they are reused verbatim.
 */
async function readPng(bytes: Uint8Array) {
  try {
    // 'that file', not 'that PNG': the message it builds is "Couldn't read X as a
    // PNG", and the whole point of that message is that X turned out not to be one.
    return await decodePngBytes(bytes, 'that file');
  } catch (error) {
    throw new AppError(400, error instanceof Error ? error.message : 'That PNG could not be read');
  }
}

const router = Router();

router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const bytes = validatePng(req.body?.png);
    const size = validateSize(req.body?.size);

    const image = await readPng(bytes);
    const longest = Math.max(image.w, image.h);
    const options = longest > IMPORT_MAX_SIDE ? downscaleOptions(image.data, image.w, image.h) : [];
    const source = { width: image.w, height: image.h };

    // No size asked for. An image that already fits is imported as it is; one
    // that does not is answered with the sizes it could be, which is the whole
    // of the analysis half of this route.
    if (size === null && longest > IMPORT_MAX_SIDE) {
      res.json({
        success: true,
        data: {
          source,
          options,
          refusal:
            `That image is ${image.w}x${image.h}, and a sprite literal stops at ` +
            `${IMPORT_MAX_SIDE}x${IMPORT_MAX_SIDE}. Ask again with a \`size\`: \`options\` lists what each one ` +
            `would be and how many colours it would have.`,
        },
      });
      return;
    }

    const { width, height } = size === null ? source : fitted(image.w, image.h, size);
    const pixels =
      width === image.w && height === image.h
        ? image.data
        : resampleNearest(image.data, image.w, image.h, width, height);

    const outcome = importRgba(pixels, width, height);
    if (!outcome.ok) {
      res.json({ success: true, data: { source, options, refusal: outcome.reason } });
      return;
    }

    res.json({
      success: true,
      data: {
        source,
        options,
        sprite: outcome.sprite,
        // The same import as a complete sketch. `sprite` is what the editor
        // wants, because it chooses between a whole sketch and a bare expression
        // at the cursor from what is already in the buffer; a caller with no
        // editor has no such choice to make and would otherwise have to
        // reimplement the `.pal()` layout to get here.
        sketch: sketchSource(outcome.sprite),
      },
    });
  }),
);

export default router;
