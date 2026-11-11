/**
 * Blit's MCP server: lets an agent list, read, create, edit, lint, render and
 * delete sketches in a running Blit.
 *
 * A thin client over the HTTP API (`/api/blit`), so the app's own validation,
 * linting and sandboxed renderer do the work and the two can never disagree.
 * Start Blit first (`npm run dev` or `npm start`), then run this over stdio:
 *
 *   npx tsx mcp/server.ts                       # BLIT_URL defaults to http://127.0.0.1:3000
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const BASE = `${(process.env.BLIT_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '')}/api/blit`;

type Content = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string };
type Result = { content: Content[]; isError?: boolean };

const text = (value: unknown): Result => ({
  content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
});
const fail = (message: string): Result => ({ content: [{ type: 'text', text: message }], isError: true });

/** Call the API; answers its `data`, or throws the API's own error message. */
async function call(method: string, path: string, body?: unknown): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error(`Blit is not reachable at ${BASE}. Start it with "npm run dev" or set BLIT_URL.`);
  }
  if (res.status === 204) return null; // a delete answers with no body
  const json = (await res.json().catch(() => null)) as { success?: boolean; data?: unknown; error?: string } | null;
  if (!res.ok || !json?.success) throw new Error(json?.error ?? `HTTP ${res.status}`);
  return json.data;
}

/** Run a tool body, turning a thrown error into an MCP error result. */
const tool =
  <A>(run: (args: A) => Promise<Result>) =>
  async (args: A): Promise<Result> => {
    try {
      return await run(args);
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
  };

const server = new McpServer({ name: 'blit', version: '1.0.0' });

const id = z.number().int().positive().describe('Sketch id, from blit_list_sketches');

server.registerTool(
  'blit_list_sketches',
  { description: 'List saved sketches: id, name, folder and when each was last changed. The list omits code.' },
  tool(async () => text(await call('GET', '/sketches'))),
);

server.registerTool(
  'blit_get_sketch',
  { description: 'Read one saved sketch, including its full source code.', inputSchema: { id } },
  tool(async ({ id }) => text(await call('GET', `/sketches/${id}`))),
);

server.registerTool(
  'blit_create_sketch',
  {
    description:
      'Save a new sketch. Lint it first with blit_lint: a sketch that does not run is saved anyway and will show its error in the editor.',
    inputSchema: {
      name: z.string().min(1).describe('Name shown in the sketch list'),
      code: z.string().min(1).describe('Blit source, e.g. size(32, 32); out(circle(8, "#e43b44").center());'),
      zoom: z.number().int().optional().describe('Canvas zoom the editor opens it at: 1, 2, 4, 8, 12 or 16'),
    },
  },
  tool(async ({ name, code, zoom }) => {
    const row = (await call('POST', '/sketches', { name, code, zoom })) as { id: number; name: string };
    return text({ id: row.id, name: row.name, saved: true });
  }),
);

server.registerTool(
  'blit_update_sketch',
  {
    description:
      'Change a saved sketch. Either replace fields wholesale (name, code, zoom), or send edits: find/replace pairs applied to the saved code, which is far cheaper for a small change to a long sketch. Edits answer a lint of the result.',
    inputSchema: {
      id,
      name: z.string().min(1).optional(),
      code: z.string().min(1).optional().describe('The whole new source'),
      zoom: z.number().int().optional(),
      edits: z
        .array(
          z.object({
            find: z.string().min(1).describe('Exact text to find; must match exactly one place unless all is true'),
            replace: z.string(),
            all: z.boolean().optional().describe('Replace every match'),
          }),
        )
        .optional()
        .describe('Find/replace edits to the saved code, applied in order, all or nothing'),
    },
  },
  tool(async ({ id, name, code, zoom, edits }) => {
    if (edits && code !== undefined) return fail('Send code or edits, not both.');
    const out: Record<string, unknown> = {};
    if (edits) out.edit = await call('PATCH', `/sketches/${id}/edit`, { edits });
    if (name !== undefined || code !== undefined || zoom !== undefined) {
      const row = (await call('PATCH', `/sketches/${id}`, { name, code, zoom })) as { id: number; name: string };
      out.updated = { id: row.id, name: row.name };
    }
    if (Object.keys(out).length === 0) return fail('Nothing to change: send name, code, zoom or edits.');
    return text(out);
  }),
);

server.registerTool(
  'blit_delete_sketch',
  { description: 'Delete a saved sketch. This cannot be undone.', inputSchema: { id } },
  tool(async ({ id }) => {
    await call('DELETE', `/sketches/${id}`);
    return text({ id, deleted: true });
  }),
);

server.registerTool(
  'blit_lint',
  {
    description:
      'Check Blit source without saving or running it: syntax, unknown functions and operators, with line and column for each problem.',
    inputSchema: { code: z.string().min(1) },
  },
  tool(async ({ code }) => text(await call('POST', '/lint', { code }))),
);

server.registerTool(
  'blit_render_png',
  {
    description:
      'Render a sketch to a PNG to look at, with the real engine. Pass id for a saved sketch or code for a draft. count > 1 lays out consecutive frames as a sheet, so an animation can be reviewed in one image.',
    inputSchema: {
      id: id.optional(),
      code: z.string().min(1).optional().describe('Unsaved source to render instead of a saved sketch'),
      frame: z.number().int().min(0).optional().describe('First frame, default 0'),
      count: z.number().int().min(1).max(16).optional().describe('How many consecutive frames, default 1'),
      scale: z.number().int().min(1).optional().describe('Pixel scale; chosen automatically when left out'),
    },
  },
  tool(async ({ id, code, frame, count, scale }) => {
    if (id === undefined && code === undefined) return fail('Send id (a saved sketch) or code (a draft).');
    const res = await fetch(`${BASE}/render`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, code, frame, count, scale }),
    }).catch(() => null);
    if (!res) return fail(`Blit is not reachable at ${BASE}. Start it with "npm run dev" or set BLIT_URL.`);
    if (!res.ok) {
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      return fail(json?.error ?? `HTTP ${res.status}`);
    }
    const png = Buffer.from(await res.arrayBuffer()).toString('base64');
    const info = ['X-Blit-Size', 'X-Blit-Frames', 'X-Blit-Scale', 'X-Blit-Warnings']
      .map((h) => (res.headers.get(h) ? `${h.slice(7)}: ${res.headers.get(h)}` : null))
      .filter(Boolean)
      .join('\n');
    return { content: [{ type: 'image', data: png, mimeType: 'image/png' }, { type: 'text', text: info }] };
  }),
);

await server.connect(new StdioServerTransport());
