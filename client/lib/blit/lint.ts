/**
 * Checking a sketch without running it.
 *
 * This is the only part of the language that runs on the SERVER, and everything
 * about it follows from that. A sketch is arbitrary JavaScript; the plugin's
 * promise is that it is evaluated in the tab of the person who typed it and
 * nowhere else (README, "Storage and scope"). So the lint parses and reads, and
 * never compiles: there is no `new Function` on this path, and `evaluate.ts` is
 * deliberately not importable from here — the names it binds live in `api.ts`.
 *
 * What that buys, and what it costs:
 *
 * - The POSITION of a syntax error is exactly the editor's, because it comes
 *   from the same Lezer parse the gutter uses. The WORDING is not: V8's message
 *   ("Unexpected token ')'") needs V8, and this path has no engine.
 * - A name that is neither in the language nor bound by the sketch is reported
 *   before it becomes a ReferenceError at frame 0.
 * - Anything that only happens while the pattern runs — a `.pal()` missing a
 *   character, a divide by zero inside `fn`, a sketch that returns a string —
 *   is invisible here. The browser is the only place that knows.
 *
 * The rules are conservative in one direction on purpose: every check
 * over-accepts rather than over-reports. A binding is counted wherever it
 * appears, not per scope, so a name declared inside one function silences the
 * check everywhere; an unknown name with no plausible correction is a warning
 * rather than an error, because the browser may genuinely provide it. A lint
 * that cries wolf about working code would just be turned off.
 */

import { PAT_CHAINABLE, PAT_CONSTRUCTORS, PAT_MEMBERS, SKETCH_NAMES, SKETCH_VOCABULARY } from './api';
import { firstErrorOffset, parseSketch, siteOfOffset } from './syntaxSite';
import type { SyntaxNode, Tree } from '@lezer/common';

/** Every rule a diagnostic can carry. openapi.json enumerates the same list. */
export const LINT_RULES = ['syntax', 'unknown-name', 'unknown-method', 'no-output', 'redeclared'] as const;
export type LintRule = (typeof LINT_RULES)[number];

/** An error means the sketch cannot run; a warning means it may not do what you meant. */
export type LintSeverity = 'error' | 'warning';

export interface LintDiagnostic {
  severity: LintSeverity;
  rule: LintRule;
  message: string;
  /** What to do about it, when the lint knows. */
  hint?: string;
  /** 1-based, and always inside the text that was linted. */
  line: number;
  column: number;
}

/** Which shape the sketch is, which decides whether it needs `out()`. */
export type SketchForm = 'expression' | 'statement';

export interface LintResult {
  /** True when nothing would stop the sketch running. Warnings do not clear it. */
  ok: boolean;
  /** Null when the sketch does not parse, so neither shape applies. */
  form: SketchForm | null;
  diagnostics: LintDiagnostic[];
}

/**
 * Standard JavaScript globals a sketch may reach for.
 *
 * Deliberately only the ECMAScript ones (plus `console` and `performance`, which
 * every host has): they are the set that is present wherever a sketch might run,
 * so accepting them cannot be wrong. `window`, `document` and `fetch` are left
 * out — not because they fail, but because a sketch reaching into the page is
 * outside the language, and saying so as a warning is more use than silence.
 */
export const JS_GLOBALS: ReadonlySet<string> = new Set([
  'Array', 'ArrayBuffer', 'BigInt', 'Boolean', 'DataView', 'Date', 'Error', 'EvalError',
  'Float32Array', 'Float64Array', 'Function', 'Infinity', 'Int16Array', 'Int32Array', 'Int8Array',
  'Intl', 'JSON', 'Map', 'Math', 'NaN', 'Number', 'Object', 'Promise', 'Proxy', 'RangeError',
  'ReferenceError', 'Reflect', 'RegExp', 'Set', 'String', 'Symbol', 'SyntaxError', 'TypeError',
  'URIError', 'Uint16Array', 'Uint32Array', 'Uint8Array', 'Uint8ClampedArray', 'WeakMap', 'WeakSet',
  'decodeURI', 'decodeURIComponent', 'encodeURI', 'encodeURIComponent', 'globalThis', 'isFinite',
  'isNaN', 'parseFloat', 'parseInt', 'structuredClone', 'undefined',
  'console', 'performance',
]);

/** A named node's text. */
const textOf = (code: string, node: { from: number; to: number }): string => code.slice(node.from, node.to);

/** Lezer gives punctuation its own nodes; only the named ones are expressions. */
const isNamed = (node: SyntaxNode | null): boolean => node !== null && /^[A-Za-z]/.test(node.name);

/** Skip past `(` and friends to the expression a node actually wraps. */
function firstExpression(node: SyntaxNode): SyntaxNode | null {
  let child = node.firstChild;
  while (child && !isNamed(child)) child = child.nextSibling;
  return child;
}

/**
 * Levenshtein distance, capped: anything past `limit` is reported as `limit + 1`
 * because the caller only ever asks "is this close".
 */
function distance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + cost);
      row.push(value);
      if (value < best) best = value;
    }
    // Every later row is at least as large as this row's minimum, so a row that
    // is already too far away settles it.
    if (best > limit) return limit + 1;
    previous = row;
  }
  return previous[b.length];
}

/**
 * The closest of `candidates` to `name`, or null when nothing is close enough.
 *
 * Two edits, and never more than half the candidate's length: without the second
 * rule every three-letter name is "close" to every other one, and a hint that
 * guesses is worse than no hint.
 */
function nearest(name: string, candidates: Iterable<string>): string | null {
  let best: string | null = null;
  let bestAt = 3;
  for (const candidate of candidates) {
    if (candidate === name) return null;
    const limit = Math.min(2, Math.floor(candidate.length / 2));
    if (limit < 1) continue;
    const d = distance(name, candidate, limit);
    if (d <= limit && d < bestAt) {
      best = candidate;
      bestAt = d;
    }
  }
  return best;
}

/** What the sketch declares for itself, gathered without regard to scope. */
interface Collected {
  bindings: Set<string>;
  references: { name: string; from: number }[];
  members: SyntaxNode[];
}

function collect(code: string, tree: Tree): Collected {
  const bindings = new Set<string>();
  const references: { name: string; from: number }[] = [];
  const members: SyntaxNode[] = [];
  let inPattern = 0;

  tree.iterate({
    enter: (node) => {
      switch (node.name) {
        case 'ObjectPattern':
          inPattern += 1;
          break;
        case 'VariableDefinition':
          bindings.add(textOf(code, node));
          break;
        case 'PropertyName':
          // `let { x } = p` binds `x` and the grammar records it as a property,
          // not a definition. Inside a pattern every key is therefore treated as
          // a binding — which also swallows the key of `{ a: renamed }`, an
          // over-accept that can only lose a report, never invent one.
          if (inPattern > 0) bindings.add(textOf(code, node));
          break;
        case 'VariableName':
          references.push({ name: textOf(code, node), from: node.from });
          break;
        case 'MemberExpression':
          members.push(node.node);
          break;
        default:
          break;
      }
      return true;
    },
    leave: (node) => {
      if (node.name === 'ObjectPattern') inPattern -= 1;
    },
  });

  return { bindings, references, members };
}

/**
 * Node types that do NOT open a scope, so a definition under them is still at
 * the top level of the function body a sketch compiles to.
 *
 * Measured against the real grammar: a top-level `const live` reports the parent
 * chain `[VariableDeclaration]` and a top-level `function live` reports
 * `[FunctionDeclaration]`, while every scoped shape carries something else -
 * `[VariableDeclaration, Block, ArrowFunction, ...]` inside a callback,
 * `[VariableDeclaration, ForSpec, ForStatement]` in a loop head,
 * `[ParamList, ArrowFunction, VariableDeclaration]` for a parameter, and
 * `[CatchClause, TryStatement]` for a catch binding.
 */
const SCOPELESS_PARENTS: ReadonlySet<string> = new Set([
  'VariableDeclaration',
  'FunctionDeclaration',
  'ClassDeclaration',
]);

/**
 * Names the sketch declares at its own top level that the language already binds.
 *
 * Only the top level, because every name in the language is a PARAMETER of the
 * function a sketch compiles to, and a parameter can be shadowed inside any
 * nested scope. Measured: `const live = 1` fails to compile, while
 * `const f = () => { const live = 1; }` and `{ var live = 1; }` are both fine.
 *
 * `names` is a parameter rather than a closed-over constant so a test can ask
 * what this rule WOULD have said about a name the language has not taken. That
 * is how the one collision the corpus ever had was found, and it is the only way
 * to ask the question without shipping the name first.
 *
 * Over-accepts in exactly one shape, which is the direction every rule in this
 * file leans: `const { live } = x` does collide, but the grammar records that
 * binding as a `PropertyName` inside an `ObjectPattern` rather than a
 * `VariableDefinition`, and treating every pattern key as a binding would report
 * `const { live: mine } = x`, which is legal. A missed report leaves a sketch
 * failing the way it already fails; a false one would be the lint being wrong
 * about working code.
 */
export function topLevelRedeclarations(
  code: string,
  tree: Tree,
  names: readonly string[] = SKETCH_NAMES,
): { name: string; at: number }[] {
  const known = new Set(names);
  const seen = new Set<string>();
  const found: { name: string; at: number }[] = [];

  tree.iterate({
    enter: (node) => {
      if (node.name !== 'VariableDefinition') return true;
      const name = textOf(code, node);
      if (!known.has(name) || seen.has(name)) return true;
      for (let parent = node.node.parent; parent !== null && parent.name !== 'Script'; parent = parent.parent) {
        if (!SCOPELESS_PARENTS.has(parent.name)) return true;
      }
      seen.add(name);
      found.push({ name, at: node.from });
      return true;
    },
  });

  return found;
}

/** The `PropertyName` a member expression reads, or null when it is computed (`p[0]`). */
const propertyOf = (member: SyntaxNode): SyntaxNode | null => member.getChild('PropertyName');

/**
 * Is this expression statically known to be a pattern?
 *
 * Only a call answers yes: `sprite(art)` is a Pat, the bare name `sprite` is a
 * function. From there a chain stays a Pat for as long as every link is a known
 * member, which is what stops the check running off into `Math.max(…).toFixed()`.
 */
function patExprTest(code: string): (node: SyntaxNode | null) => boolean {
  const memo = new Map<string, boolean>();

  const test = (node: SyntaxNode | null): boolean => {
    if (!node) return false;
    const key = `${node.from}:${node.to}:${node.name}`;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;

    let answer = false;
    if (node.name === 'ParenthesizedExpression') {
      answer = test(firstExpression(node));
    } else if (node.name === 'CallExpression') {
      const callee = firstExpression(node);
      if (callee?.name === 'VariableName') {
        answer = PAT_CONSTRUCTORS.has(textOf(code, callee));
      } else if (callee?.name === 'MemberExpression') {
        const property = propertyOf(callee);
        // PAT_CHAINABLE, not PAT_MEMBERS: `solid(c).at(0, 0)` is a Color, and
        // treating it as a pattern would have the check guessing at Color's
        // methods next.
        answer =
          property !== null &&
          PAT_CHAINABLE.has(textOf(code, property)) &&
          test(firstExpression(callee));
      }
    }

    memo.set(key, answer);
    return answer;
  };

  return test;
}

/**
 * Check a sketch, without saving, compiling or running it.
 *
 * Pure: the same text always gives the same answer, and nothing outside is read
 * or written. That is what makes it safe to expose as a route.
 */
export function lintSketch(code: string): LintResult {
  const tree = parseSketch(code);
  if (tree === null) {
    // The grammar itself gave up, which is not the sketch's fault and not
    // something a position can be claimed for.
    return { ok: true, form: null, diagnostics: [] };
  }

  const brokenAt = firstErrorOffset(tree);
  if (brokenAt !== null) {
    // Stop here. Past a parse error the tree is error nodes, and every name read
    // out of it is a guess — reporting those would bury the one finding that is
    // certain under noise the caller cannot act on.
    const site = siteOfOffset(code, brokenAt);
    return {
      ok: false,
      form: null,
      diagnostics: [
        {
          severity: 'error',
          rule: 'syntax',
          message: 'This stops being valid JavaScript here.',
          hint: 'Check for an unclosed bracket, backtick or quote before this point.',
          line: site.line,
          column: site.column,
        },
      ],
    };
  }

  const { bindings, references, members } = collect(code, tree);
  const found: { at: number; diagnostic: LintDiagnostic }[] = [];
  const push = (at: number, diagnostic: Omit<LintDiagnostic, 'line' | 'column'>): void => {
    const site = siteOfOffset(code, at);
    found.push({ at, diagnostic: { ...diagnostic, line: site.line, column: site.column } });
  };

  // ── Redeclaring the language ─────────────────────────────────────────────
  // Reported first, and ahead of the names loop, because `collect` has already
  // added the declaration to `bindings` and the names loop would therefore skip
  // every reference to it: without this the collision is not merely unreported,
  // it is actively silenced.
  for (const { name, at } of topLevelRedeclarations(code, tree)) {
    push(at, {
      severity: 'error',
      rule: 'redeclared',
      message: `\`${name}\` is already part of the language, so a sketch cannot declare it.`,
      hint: 'Rename it. Every name in the language is a parameter of the function a sketch compiles to.',
    });
  }

  // ── Names ────────────────────────────────────────────────────────────────
  const reportedNames = new Set<string>();
  for (const reference of references) {
    const { name } = reference;
    if (reportedNames.has(name)) continue;
    if (bindings.has(name) || SKETCH_NAMES.includes(name) || JS_GLOBALS.has(name)) continue;
    reportedNames.add(name);

    const suggestion = nearest(name, [...SKETCH_VOCABULARY, ...JS_GLOBALS, ...bindings]);
    if (suggestion) {
      push(reference.from, {
        severity: 'error',
        rule: 'unknown-name',
        message: `\`${name}\` is not defined.`,
        hint: `Did you mean \`${suggestion}\`?`,
      });
    } else {
      push(reference.from, {
        severity: 'warning',
        rule: 'unknown-name',
        // A warning, not an error: this check cannot see the page the sketch
        // will run in, and a name it does not know may still be there.
        message: `\`${name}\` is not part of the sketch language and this sketch does not define it.`,
        hint: 'It will throw ReferenceError unless the browser provides it.',
      });
    }
  }

  // ── Methods on a pattern ─────────────────────────────────────────────────
  const isPat = patExprTest(code);
  const reportedMembers = new Set<string>();
  for (const member of members) {
    const property = propertyOf(member);
    if (!property) continue;
    const name = textOf(code, property);
    if (PAT_MEMBERS.has(name) || reportedMembers.has(name)) continue;
    if (!isPat(firstExpression(member))) continue;
    reportedMembers.add(name);

    const suggestion = nearest(name, PAT_MEMBERS);
    push(property.from, {
      severity: 'error',
      rule: 'unknown-method',
      message: `A pattern has no \`${name}\`.`,
      hint: suggestion ? `Did you mean \`${suggestion}\`?` : 'See docs/language.md for the operators a pattern has.',
    });
  }

  // ── Does it produce anything? ────────────────────────────────────────────
  // The statement form returns nothing on its own, so a sketch that compiles
  // only as statements and never names `out` cannot produce a pattern — the
  // evaluator would reach "This sketch produced no pattern" every time.
  // Only a REFERENCE to `out` is required, not a call: `const o = out; o(p)`
  // works, and a lint that insisted on the call shape would be wrong about it.
  const form: SketchForm = isExpression(code) ? 'expression' : 'statement';
  if (form === 'statement' && !references.some((r) => r.name === 'out')) {
    push(code.length, {
      severity: 'error',
      rule: 'no-output',
      message: 'This sketch produces no pattern.',
      hint: 'End with a pattern expression instead of statements, or call out(pattern).',
    });
  }

  found.sort((a, b) => a.at - b.at);
  const diagnostics = found.map((f) => f.diagnostic);
  return { ok: !diagnostics.some((d) => d.severity === 'error'), form, diagnostics };
}

/**
 * Would this compile as one expression?
 *
 * Asked the way the evaluator asks it — by wrapping the text the same way
 * `expressionBody` does — but with the grammar instead of `new Function`, which
 * is the whole point of this module. Same wrapping, same verdict, no compile.
 */
function isExpression(code: string): boolean {
  const tree = parseSketch(`(\n${code}\n)`);
  return tree !== null && firstErrorOffset(tree) === null;
}
