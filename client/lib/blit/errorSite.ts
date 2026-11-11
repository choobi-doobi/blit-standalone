/**
 * Where in the sketch it went wrong.
 *
 * A live-coding editor that says "Unexpected token ')'" and nothing else makes
 * you hunt. The position is recoverable, but from two different places depending
 * on how the sketch failed, and neither is obvious:
 *
 * **A runtime throw carries a position in its stack.** `new Function` compiles
 * the body as `<anonymous>`, and V8 puts `<anonymous>:LINE:COL` in the stack of
 * anything thrown from inside it. Those line numbers are relative to the whole
 * function source V8 generated, which is the body plus a wrapper (`function
 * anonymous(a,b,c` / `) {`) plus whatever prologue we prepended. So a raw stack
 * line has to have two offsets subtracted from it before it means anything to
 * someone looking at the editor.
 *
 * The prologue offset is COMPUTED from the body strings below rather than written
 * down, so changing `expressionBody` can never silently shift every reported
 * line. The wrapper offset is MEASURED from the engine once, by compiling a probe
 * that throws on a line we know, because two lines is V8's shape today and not a
 * promise. Both are derivations, not constants, and that is the point.
 *
 * **A SyntaxError does NOT carry a position.** This is the surprise, and it is
 * measured, not assumed: a `new Function` that fails to parse throws a
 * SyntaxError whose `stack` points at the CALLER, with no `<anonymous>` frame and
 * no `lineNumber`. There is nothing in it to read. The compile phase gets its
 * position from `syntaxSite` instead, which asks the same grammar the editor is
 * already running. See that file.
 *
 * Non-V8 engines format stacks differently and are left without a position
 * rather than guessed at: a line number that is confidently wrong is worse than
 * no line number, because the gutter marker would then point at innocent code.
 */

export interface Site {
  /** 1-based, and in the USER's buffer. */
  line: number;
  /** 1-based. */
  column: number;
}

/** Which of the two shapes a sketch compiled as. They have different prologues. */
export type CompiledForm = 'expression' | 'statement';

/**
 * The directive every compiled sketch opens with.
 *
 * A `new Function` body is SLOPPY unless it says otherwise, and sloppy mode
 * turns a mistyped name into an assignment to a global: `wdith = 32` silently
 * does nothing to the sketch and writes `window.wdith` instead. That fails twice
 * over. The typo is invisible, so the sketch quietly ignores what was asked of
 * it, when Blit's whole failure story is that the error panel tells you what is
 * wrong. And the write lands on the host page, where several names a pixel
 * sketch would plausibly reach for are real, load-bearing properties of
 * `window`: `name`, `status`, `origin`, `length`, `close`.
 *
 * It has to be prepended to BOTH compiled forms. A directive is only a directive
 * as the first statement of the body, so it cannot live inside the sketch.
 *
 * The trailing newline keeps it clear of a sketch that opens with a line comment.
 */
export const STRICT = "'use strict';\n";

/**
 * The expression form: a sketch that is one expression, which is the common case.
 *
 * The newline before `)` matters: it keeps a trailing line comment from
 * swallowing the closing paren.
 */
export function expressionBody(code: string): string {
  return `${STRICT}return (\n${code}\n);`;
}

/** The statement form: a sketch with statements in it. */
export function statementBody(code: string): string {
  return `${STRICT}${code}`;
}

/** How many lines each form puts BEFORE the sketch's own first line. */
function prologueLines(build: (code: string) => string): number {
  const marker = '\u0000SKETCH\u0000';
  const before = build(marker).split(marker)[0] ?? '';
  return before.split('\n').length - 1;
}

export const PROLOGUE: Record<CompiledForm, number> = {
  expression: prologueLines(expressionBody),
  statement: prologueLines(statementBody),
};

/**
 * The first `<anonymous>:LINE:COL` in a stack, exactly as the engine reported it.
 *
 * First, not last: a throw from inside a user callback during the draw loop has
 * the sketch's own frame on top and Blit's rendering frames beneath it, so the
 * first match is the user's code. Note a V8 stack line mentions `<anonymous>`
 * twice (`eval at <anonymous> (...), <anonymous>:6:7`); requiring the `:LINE:COL`
 * is what picks out the one that is a position.
 */
export function rawStackSite(stack: unknown): Site | null {
  if (typeof stack !== 'string') return null;
  const match = /<anonymous>:(\d+):(\d+)/.exec(stack);
  if (!match) return null;
  const line = Number(match[1]);
  const column = Number(match[2]);
  if (!Number.isFinite(line) || !Number.isFinite(column)) return null;
  return { line, column };
}

type Compiler = (body: string) => () => unknown;

const defaultCompiler: Compiler = (body) => new Function(body) as () => unknown;

/**
 * How many lines the engine's own function wrapper adds, measured once.
 *
 * `undefined` means "not measured yet"; `null` means "measured, and this engine
 * does not report positions we can read".
 */
let measured: number | null | undefined;

export function wrapperOffset(compile: Compiler = defaultCompiler): number | null {
  if (measured !== undefined) return measured;
  measured = measure(compile);
  return measured;
}

/** Only for tests: forget the measurement so another engine shape can be tried. */
export function resetWrapperOffset(): void {
  measured = undefined;
}

function measure(compile: Compiler): number | null {
  // The probe throws on the sketch's FIRST line, so whatever the engine reports
  // minus that line's known position in the body is the wrapper's contribution.
  const knownBodyLine = PROLOGUE.statement + 1;
  try {
    compile(statementBody("throw new Error('blit-probe');"))();
    return null; // it did not throw, so there is nothing to calibrate against
  } catch (error) {
    const raw = rawStackSite(error instanceof Error ? error.stack : null);
    if (!raw) return null;
    const offset = raw.line - knownBodyLine;
    return offset >= 0 ? offset : null;
  }
}

/**
 * Turn a thrown error into a position in the user's buffer.
 *
 * Returns null unless every step is sound, which is deliberate: the caller shows
 * the message with no line rather than a line that might be wrong.
 */
export function siteFromError(error: unknown, form: CompiledForm, compile?: Compiler): Site | null {
  const raw = rawStackSite(error instanceof Error ? error.stack : null);
  if (!raw) return null;
  const offset = wrapperOffset(compile);
  if (offset === null) return null;
  const line = raw.line - offset - PROLOGUE[form];
  if (!Number.isInteger(line) || line < 1) return null;
  return { line, column: Math.max(1, raw.column) };
}
