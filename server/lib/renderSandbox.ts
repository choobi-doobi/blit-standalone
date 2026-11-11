/**
 * Running a sketch on the server, for `POST /api/blit/render`.
 *
 * Until this existed Blit's rule was that sketch code runs only in the browser
 * tab of the person who typed it. An agent has no tab, and without a picture it
 * has been hand-writing its own imitation of the engine to check its work. So
 * the server now runs sketches too, and this file is the whole of how, because
 * a sketch is arbitrary JavaScript and the server is not a place it can be let
 * loose in. Three layers, any one of which would stop the obvious attacks:
 *
 * 1. **A separate process** with an EMPTY environment (no secrets to read),
 *    Node's permission model on (no file reads or writes, no child processes,
 *    no workers, no native addons), a heap cap and a wall-clock kill. A sketch
 *    that loops forever, or allocates until it dies, takes only itself down.
 * 2. **A vm context whose global has a null prototype.** The classic vm escape,
 *    `this.constructor.constructor('return process')()`, works because a
 *    context's global is an ordinary host object; a null-prototype one leaves
 *    nothing to climb. `lib/renderSandbox.test.ts` asserts the escape fails.
 * 3. **Only strings cross.** The engine is loaded into the context as source
 *    text (`RENDER_RUNTIME_SOURCE`) and called with a JSON string; it answers a
 *    string. No host function or object is ever passed in, which is the other
 *    way a context gets a handle on the outside.
 *
 * Node's docs are right that `vm` alone is not a security boundary, which is
 * why it is layer two and not the plan.
 */

import { spawn } from 'node:child_process';
import os from 'node:os';

import type { RenderHeader, RenderInput } from './renderEntry.js';
import { RENDER_RUNTIME_SOURCE } from './renderRuntime.generated.js';

/** How long the sketch may run inside the vm, per phase (load, then render). */
export const VM_TIMEOUT_MS = 5_000;
/** How long the whole child may live, spawn to exit. */
export const PROCESS_TIMEOUT_MS = 12_000;
/** The child's V8 heap cap. A 16-frame 512x512 render needs well under this. */
export const HEAP_MB = 256;

/**
 * The child's program, run with `node -e`: no file on disk to find, ship or
 * keep in step. Reads one JSON message on stdin, writes the header line as
 * UTF-8 and the pixels as raw bytes on stdout.
 *
 * The scripts are given filenames on purpose. Left to itself vm names them
 * `evalmachine.<anonymous>`, and the engine locates a sketch's error by the
 * first `<anonymous>:line:col` in the stack (errorSite.ts) — which would then
 * be a position in the minified bundle rather than in the sketch.
 */
const DRIVER = String.raw`'use strict';
const vm = require('node:vm');
const chunks = [];
process.stdin.on('data', (c) => chunks.push(c));
process.stdin.on('end', () => {
  const { runtime, input, timeout } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  let out;
  try {
    const context = vm.createContext(Object.create(null), { microtaskMode: 'afterEvaluate' });
    vm.runInContext(runtime, context, { timeout, filename: 'blit-render.js' });
    context.__input = input;
    out = vm.runInContext('BlitRender.render(__input)', context, { timeout, filename: 'blit-render-call.js' });
  } catch (e) {
    const timedOut = e && e.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT';
    out = JSON.stringify({
      ok: false,
      error: timedOut ? 'The sketch took longer than ' + timeout + 'ms to render.' : 'The sketch crashed the renderer: ' + String(e && e.message),
      phase: 'run', line: null, column: null,
    }) + '\n';
  }
  if (typeof out !== 'string') out = JSON.stringify({ ok: false, error: 'The renderer answered nothing.', phase: 'run', line: null, column: null }) + '\n';
  const nl = out.indexOf('\n');
  process.stdout.write(Buffer.from(out.slice(0, nl + 1), 'utf8'));
  process.stdout.end(Buffer.from(out.slice(nl + 1), 'latin1'));
});
`;

/** Node 20 spells it `--experimental-permission`; 22 and later, `--permission`. */
function permissionFlag(): string {
  return process.allowedNodeEnvironmentFlags.has('--permission') ? '--permission' : '--experimental-permission';
}

export type SandboxResult =
  | { header: Extract<RenderHeader, { ok: true }>; pixels: Buffer }
  | { header: Exclude<RenderHeader, { ok: true }> };

/** A failure of the sandbox itself, rather than of the sketch. */
export class SandboxError extends Error {}

export interface SandboxOptions {
  /** Most bytes of pixels the child may answer before it is killed. */
  maxPixelBytes: number;
  /** For tests: a different engine source. */
  runtime?: string;
  vmTimeoutMs?: number;
  processTimeoutMs?: number;
}

export function runSandboxed(input: RenderInput, options: SandboxOptions): Promise<SandboxResult> {
  const message = JSON.stringify({
    runtime: options.runtime ?? RENDER_RUNTIME_SOURCE,
    input: JSON.stringify(input),
    timeout: options.vmTimeoutMs ?? VM_TIMEOUT_MS,
  });
  const cap = options.maxPixelBytes + 64 * 1024;

  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [permissionFlag(), '--no-warnings', `--max-old-space-size=${HEAP_MB}`, '-e', DRIVER],
      { env: {}, cwd: os.tmpdir(), stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true },
    );

    const out: Buffer[] = [];
    let size = 0;
    let stderr = '';
    let settled = false;
    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(() => reject(new SandboxError(`The sketch took longer than ${options.processTimeoutMs ?? PROCESS_TIMEOUT_MS}ms to render.`)));
    }, options.processTimeoutMs ?? PROCESS_TIMEOUT_MS);

    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > cap) {
        child.kill('SIGKILL');
        finish(() => reject(new SandboxError('The render was larger than it was allowed to be.')));
        return;
      }
      out.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < 4096) stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => finish(() => reject(new SandboxError(`The renderer could not start: ${error.message}`))));
    child.on('close', (code) => {
      finish(() => {
        const all = Buffer.concat(out);
        const nl = all.indexOf(0x0a);
        if (code !== 0 || nl === -1) {
          const oom = /heap out of memory|Allocation failed/i.test(stderr);
          reject(
            new SandboxError(
              oom
                ? `The sketch used more than ${HEAP_MB}MB of memory.`
                : `The renderer stopped unexpectedly (exit ${code ?? 'signal'}).`,
            ),
          );
          return;
        }
        let header: RenderHeader;
        try {
          header = JSON.parse(all.subarray(0, nl).toString('utf8')) as RenderHeader;
        } catch {
          reject(new SandboxError('The renderer answered something unreadable.'));
          return;
        }
        if (!header.ok) {
          resolve({ header });
          return;
        }
        const pixels = all.subarray(nl + 1);
        if (pixels.length !== header.w * header.h * 4 * header.frames) {
          reject(new SandboxError('The renderer answered the wrong number of pixels.'));
          return;
        }
        resolve({ header, pixels });
      });
    });

    child.stdin.on('error', () => {
      // The child can die before reading everything; 'close' reports why.
    });
    child.stdin.end(message);
  });
}
