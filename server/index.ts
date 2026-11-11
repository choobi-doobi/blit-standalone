import { createApp } from './app.js';
import { db } from './db.js';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '127.0.0.1';

db(); // open and migrate before taking traffic
createApp().listen(port, host, () => {
  console.log(`Blit listening on http://${host}:${port}`);
});
