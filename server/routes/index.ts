import { Router, type Request, type Response } from 'express';
import { asyncHandler } from '../http.js';

import folders from './folders.js';
import importPng from './importPng.js';
import lint from './lint.js';
import render from './render.js';
import sketches from './sketches.js';
import { pluginStatus } from './status.js';

const router = Router();

router.get(
  '/status',
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({ success: true, data: pluginStatus() });
  }),
);

router.use('/sketches', sketches);
router.use('/folders', folders);
router.use('/lint', lint);
router.use('/render', render);
router.use('/import', importPng);

export default router;
