/**
 * Scene mode's edits to the source: move a `blit()` call, and add one.
 *
 * Scene mode is click-to-paint's sibling. Paint edits the character a pixel came
 * from; scene mode edits the numbers a placed sketch's position came from. Both
 * write SOURCE, never a hidden layer, because the text is the document: a scene
 * dragged into shape by hand is still a sketch somebody can read, diff, and
 * carry on in code.
 *
 * The edits are read off the Lezer tree of the ORIGINAL buffer, the same grammar
 * the editor highlights with, rather than off a regex. A position is movable only
 * when it is written as plain numbers (or left out, meaning 0, 0): an expression
 * like `i * 16` is the sketch's own arithmetic, and rewriting it into a literal
 * would quietly throw that logic away.
 */

import type { SyntaxNode, Tree } from '@lezer/common';

import { parseSketch } from './syntaxSite';

/** One argument of a call, as written. */
interface Arg {
  from: number;
  to: number;
  text: string;
}

interface CallArgs {
  args: Arg[];
  /** Offset of the closing parenthesis, or -1 when the call is unterminated. */
  close: number;
}

const INTEGER = /^-?\s*\d+$/;

/** The calls made for effect: they answer no pattern to layer anything over. */
const SETTINGS = new Set(['size', 'fps', 'cycle', 'ramp']);

/** The arguments of the call whose `(` is at `open`. */
function argsAt(code: string, open: number, parsed?: Tree | null): CallArgs | null {
  const tree = parsed ?? parseSketch(code);
  if (!tree) return null;
  let list: SyntaxNode | null = tree.resolveInner(open, 1);
  while (list && !(list.name === 'ArgList' && list.from === open)) list = list.parent;
  if (!list) return null;
  return readArgs(code, list);
}

function readArgs(code: string, list: SyntaxNode): CallArgs {
  const args: Arg[] = [];
  let close = -1;
  for (let child = list.firstChild; child; child = child.nextSibling) {
    if (child.name === '(' || child.name === ',' || child.type.isError) continue;
    if (child.name === ')') {
      close = child.from;
      continue;
    }
    if (child.name === 'LineComment' || child.name === 'BlockComment') continue;
    args.push({ from: child.from, to: child.to, text: code.slice(child.from, child.to) });
  }
  return { args, close };
}

/** Whether a `blit(` call's position is written in a form a drag can rewrite. */
export function isMovable(code: string, open: number, parsed?: Tree | null): boolean {
  const call = argsAt(code, open, parsed);
  if (!call || call.close === -1 || call.args.length === 0 || call.args.length > 3) return false;
  return call.args.slice(1).every((arg) => INTEGER.test(arg.text));
}

/** Which of these calls are movable, from ONE parse of the buffer. */
export function movableCalls(code: string, calls: ReadonlyArray<{ id: number; open: number }>): Set<number> {
  const movable = new Set<number>();
  if (calls.length === 0) return movable;
  const tree = parseSketch(code);
  if (!tree) return movable;
  for (const call of calls) if (isMovable(code, call.open, tree)) movable.add(call.id);
  return movable;
}

/**
 * Rewrite the position of the `blit(` call whose `(` is at `open`.
 *
 * Answers the new text, or null when the position is not the call's to give
 * (see `isMovable`). A call with no position gets one appended after its
 * reference, which is how a freshly typed `blit('Coin')` becomes draggable.
 */
export function moveBlitCall(code: string, open: number, x: number, y: number): string | null {
  if (!isMovable(code, open)) return null;
  const call = argsAt(code, open);
  if (!call) return null;
  const [ref, ax, ay] = call.args;
  const nx = String(Math.round(x));
  const ny = String(Math.round(y));

  if (ax && ay) return code.slice(0, ax.from) + nx + code.slice(ax.to, ay.from) + ny + code.slice(ay.to);
  if (ax) return code.slice(0, ax.from) + nx + ', ' + ny + code.slice(ax.to);
  return code.slice(0, ref.to) + `, ${nx}, ${ny}` + code.slice(ref.to);
}

/** The range of the whole `blit(...)` call starting at `start`, for selecting it in the editor. */
export function callRange(code: string, start: number, open: number): { from: number; to: number } | null {
  const call = argsAt(code, open);
  if (!call || call.close === -1) return null;
  return { from: start, to: call.close + 1 };
}

/** A reference as a JavaScript literal: `'Coin'`, or the id when the name is not unique. */
export function refLiteral(ref: string | number): string {
  if (typeof ref === 'number') return String(ref);
  return `'${ref.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
}

/** The call scene mode writes for a placed sketch. */
export function blitCallText(ref: string | number, x: number, y: number): string {
  return `blit(${refLiteral(ref)}, ${Math.round(x)}, ${Math.round(y)})`;
}

export interface Inserted {
  code: string;
  /** Offset of the inserted `blit` in the new text, to find its instance by. */
  at: number;
}

/** The indentation of the line `offset` sits on. */
function indentAt(code: string, offset: number): string {
  const lineStart = code.lastIndexOf('\n', offset - 1) + 1;
  return /^[ \t]*/.exec(code.slice(lineStart))?.[0] ?? '';
}

function callee(code: string, call: SyntaxNode): string {
  const fn = call.firstChild;
  return fn && fn.name === 'VariableName' ? code.slice(fn.from, fn.to) : '';
}

/** Append `text` as the last argument of a call's list, keeping its layout. */
function appendArg(code: string, list: SyntaxNode, text: string): Inserted | null {
  const { args, close } = readArgs(code, list);
  if (close === -1) return null;
  if (args.length === 0) {
    const insert = `\n  ${text},\n`;
    return { code: code.slice(0, list.from + 1) + insert + code.slice(close), at: list.from + 4 };
  }
  const last = args[args.length - 1];
  const between = code.slice(last.to, close);
  const trailingComma = between.indexOf(',');
  const multiline = code.slice(list.from, close).includes('\n');

  if (!multiline) {
    const insert = `, ${text}`;
    return { code: code.slice(0, last.to) + insert + code.slice(last.to), at: last.to + 2 };
  }
  const indent = indentAt(code, last.from);
  if (trailingComma !== -1) {
    const after = last.to + trailingComma + 1;
    const insert = `\n${indent}${text},`;
    return { code: code.slice(0, after) + insert + code.slice(after), at: after + 1 + indent.length };
  }
  const insert = `,\n${indent}${text}`;
  return { code: code.slice(0, last.to) + insert + code.slice(last.to), at: last.to + 2 + indent.length };
}

/** Wrap the expression at `node` in a `scene(...)` with `text` as a second layer. */
function wrapInScene(code: string, node: { from: number; to: number }, text: string): Inserted {
  const indent = indentAt(code, node.from);
  const inner = `${indent}  `;
  const head = `scene(\n${inner}`;
  // Verbatim, not re-indented: the body may hold sprite grids, and a template
  // literal's text is data whose every character a paint stroke addresses.
  const body = code.slice(node.from, node.to);
  const tail = `,\n${inner}${text},\n${indent})`;
  const replaced = head + body + tail;
  const at = node.from + head.length + body.length + 2 + inner.length;
  return { code: code.slice(0, node.from) + replaced + code.slice(node.to), at };
}

/**
 * Add a placed sketch to the scene, as source.
 *
 * Where it goes, in order: into the first `scene(...)` in the sketch, which is
 * how a sketch names its layer list; else around what the sketch outputs, which
 * turns `out(x)` into `out(scene(x, blit(...)))` and a bare expression into a
 * `scene()` of itself and the new layer. Anything else — no output the grammar
 * can find, or `out()` called more than once — answers null, because guessing
 * which output was meant would put the layer somewhere nobody asked for.
 */
export function insertBlit(code: string, text: string): Inserted | null {
  const tree = parseSketch(code);
  if (!tree) return null;

  let scene: SyntaxNode | null = null;
  const outs: SyntaxNode[] = [];
  tree.iterate({
    enter: (ref) => {
      if (ref.name !== 'CallExpression') return true;
      const name = callee(code, ref.node);
      if (name === 'scene' && !scene) scene = ref.node;
      if (name === 'out') outs.push(ref.node);
      return true;
    },
  });

  const sceneNode = scene as SyntaxNode | null;
  if (sceneNode) {
    const list = sceneNode.getChild('ArgList');
    return list ? appendArg(code, list, text) : null;
  }

  if (outs.length === 1) {
    const list = outs[0].getChild('ArgList');
    if (!list) return null;
    const { args } = readArgs(code, list);
    if (args.length !== 1) return null;
    return wrapInScene(code, args[0], text);
  }
  if (outs.length > 1) return null;

  // No sink: the expression form, or a `return`.
  const top = tree.topNode;
  const statements: SyntaxNode[] = [];
  for (let child = top.firstChild; child; child = child.nextSibling) {
    if (child.name === 'LineComment' || child.name === 'BlockComment') continue;
    statements.push(child);
  }
  const last = statements[statements.length - 1];
  if (!last) return null;
  if (last.name === 'ReturnStatement') {
    const value = last.firstChild?.nextSibling;
    if (!value || value.name === ';') return null;
    return wrapInScene(code, value, text);
  }
  if (statements.length === 1 && last.name === 'ExpressionStatement') {
    const value = last.firstChild;
    // A lone `size(8)` is a setting, not a picture: there is nothing to layer on.
    if (!value || (value.name === 'CallExpression' && SETTINGS.has(callee(code, value)))) return null;
    return wrapInScene(code, value, text);
  }
  return null;
}
