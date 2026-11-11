/**
 * `POST /api/blit/lint` — does this sketch hold up, without saving or running it.
 *
 * The one route on this plugin that looks at sketch source rather than storing
 * it, and the reason it is allowed to exist is that it does not EXECUTE any of
 * it: `client/lib/blit/lint.ts` parses with the same grammar the editor
 * highlights with and reads names off the tree. (`POST /render` is the route that
 * does run a sketch, and it does so only inside lib/renderSandbox.ts.)
 *
 * A person gets this feedback from the gutter as they type; a script writing a
 * sketch through the API has no gutter, and without this its only check is to
 * save something broken and wait for a human to open it. A POST because a body
 * of up to 200k cannot go on a GET.
 */

import { Router, type Request, type Response } from 'express';
import { asyncHandler } from '../http.js';

import { PAT_OPERATORS, SKETCH_VOCABULARY } from '../../client/lib/blit/api.js';
import { lintSketch } from '../../client/lib/blit/lint.js';
import { validateCode } from './sketches.js';

const router = Router();

router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const code = validateCode(req.body?.code);
    res.json({
      success: true,
      data: {
        ...lintSketch(code),
        // Shipped with every answer, not just a failing one. It is a handful of
        // bytes, it is the only place a caller with no browser can learn the
        // language's surface, and half the mistakes this route reports are a
        // name the caller was guessing at.
        vocabulary: [...SKETCH_VOCABULARY],
        operators: [...PAT_OPERATORS],
      },
    });
  }),
);

export default router;
