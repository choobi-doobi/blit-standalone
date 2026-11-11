import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';

import { errorHandler } from './http.js';
import api from './routes/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CLIENT_DIST = path.join(ROOT, 'dist');

/**
 * The Express app: the JSON API under `/api/blit`, and (when built) the client
 * from `dist/` with every other GET falling back to `index.html`.
 */
export function createApp(options: { serveClient?: boolean } = {}): express.Express {
  const app = express();
  app.disable('x-powered-by');
  // A sketch is up to 200k of source and an import carries a base64 PNG.
  app.use(express.json({ limit: '25mb' }));
  app.use('/api/blit', api);
  app.use('/api', (_req, res) => {
    res.status(404).json({ success: false, error: 'Not found' });
  });

  if (options.serveClient !== false && fs.existsSync(path.join(CLIENT_DIST, 'index.html'))) {
    app.use(express.static(CLIENT_DIST, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(CLIENT_DIST, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
