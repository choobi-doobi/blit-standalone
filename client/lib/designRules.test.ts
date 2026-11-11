/**
 * A lint over Blit's client source for the DESIGN.md rules that fail SILENTLY.
 *
 * Why these are a test and not a code review: not one of them is an error
 * anywhere. `text-accent-foreground` is not a token in this theme, so it
 * compiles to nothing. `badge-secondary` is an unknown utility and renders an
 * unstyled span. `bg-accent text-white` looks right only while the host ships a
 * blue accent, and is white on white the moment `--accent-rgb` migrates. A
 * `size="sm"` host Button is 32px, not the 22px DESIGN.md 4.2 asks for, and it
 * looks deliberate. The audit that produced this file found eight such things
 * by reading; a reading does not run again next month.
 *
 * Blit is unusual in one way that shapes every colour rule here: colour is the
 * plugin's DATA. `lib/blit/**` is a pixel-art engine whose palettes, ramps and
 * named colours are hex literals by definition, and `lib/examples.ts` is sketch
 * SOURCE displayed in the editor, where `.pal({ w: '#c0cbdc' })` is the
 * product. Pointing a colour rule at those files reports 74 violations and
 * means nothing. The colour rules therefore cover the UI surfaces -
 * `components/**`, `pages/**` and `styles.css` - which is where a theme-token
 * violation can actually land. `UI_FILES.length` is asserted below so that
 * scoping cannot silently become "no files at all", and the fixture block at
 * the bottom feeds every matcher a known violation so a matcher that stopped
 * matching fails here instead of reporting a clean sweep forever.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLIENT = join(fileURLToPath(new URL('.', import.meta.url)), '..');

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(tsx?|css)$/.test(name) && !name.includes('.test.') && !name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

interface Source {
  path: string;
  raw: string;
}

const ALL: Source[] = sourceFiles(CLIENT).map((path) => ({
  path: path.slice(CLIENT.length + 1).split(sep).join('/'),
  raw: readFileSync(path, 'utf8'),
}));

/** The chrome: everything a theme token applies to. */
const UI_FILES = ALL.filter(
  (f) => f.path.startsWith('components/') || f.path.startsWith('pages/') || f.path === 'styles.css',
);

/** Blank out comments, so a copy rule never fires on a developer note. */
function stripComments(src: string): string {
  let out = '';
  let inBlock = false;
  for (const line of src.split('\n')) {
    let rest = line;
    let kept = '';
    while (rest) {
      if (inBlock) {
        const end = rest.indexOf('*/');
        if (end === -1) {
          rest = '';
          break;
        }
        inBlock = false;
        rest = rest.slice(end + 2);
        continue;
      }
      const block = rest.indexOf('/*');
      const lineC = rest.indexOf('//');
      if (block === -1 && lineC === -1) {
        kept += rest;
        break;
      }
      if (lineC !== -1 && (block === -1 || lineC < block)) {
        kept += rest.slice(0, lineC);
        break;
      }
      kept += rest.slice(0, block);
      inBlock = true;
      rest = rest.slice(block + 2);
    }
    out += kept + '\n';
  }
  return out;
}

/**
 * Two sites draw alpha grey OVER arbitrary content rather than colouring a
 * surface: the canvas pixel grid and the transparency checkerboard. Neither can
 * be a theme token - one is a `ctx.strokeStyle` no class reaches, and both have
 * to read against whatever pixels the user's sketch put underneath. Each is
 * tagged `blit-neutral-alpha` at its site, and the tag exempts the following
 * few lines and nothing else.
 */
function stripNeutralAlpha(src: string): string {
  const lines = src.split('\n');
  let budget = 0;
  return lines
    .map((l) => {
      if (l.includes('blit-neutral-alpha')) {
        budget = 6;
        return l;
      }
      if (budget > 0 && /rgba?\(/.test(l)) {
        budget -= 1;
        return '';
      }
      if (budget > 0 && l.trim() === '') budget -= 1;
      return l;
    })
    .join('\n');
}

/**
 * Blit's chrome is Fluent 2, which means a second, foreign palette (see
 * `blitIdentity.test.ts`). It is declared exactly ONCE, in styles.css between the
 * `fluent-tokens` markers, and that block alone is exempt from the colour rule.
 *
 * Blanking it rather than deleting it keeps every later line number honest, so a
 * violation below the block still reports the line it is actually on. The
 * fixtures at the bottom prove a literal OUTSIDE the markers still fires, and
 * that an unmarked file gets no exemption at all.
 */
function stripFluentTokens(src: string): string {
  return src.replace(/\/\* fluent-tokens:start \*\/[\s\S]*?\/\* fluent-tokens:end \*\//, (block) =>
    block.replace(/[^\n]/g, ''),
  );
}

/** Matchers, named so the fixture block below can prove each one still bites. */
const RULES = {
  /** 1: tokens only. No colour literal in chrome. */
  rawColor: (line: string) => /#[0-9a-fA-F]{3,8}\b|\brgba?\(\s*\d/.test(line),

  /** 1: a token this theme does not define, so it compiles to nothing. */
  deadToken: (line: string) => /\btext-accent-foreground\b/.test(line),

  /** 2.4: a filled accent or status control pairs with `text-bg-primary`. */
  whiteOnFill: (line: string) =>
    /\bbg-(accent|error|success|warning)\b/.test(line) && /\b(text|border)-white\b/.test(line),

  /**
   * 8.4: no `badge-*` modifier, not even a documented one.
   *
   * The host DEFINES `badge-accent/success/warning/error` in
   * `src/client/styles/index.css`, but under `@layer components` with `@apply`,
   * and nothing in the host's own source uses them - so Tailwind purges all
   * four and they appear zero times in every served CSS chunk. A plugin's own
   * Tailwind cannot emit them either, because they are not utilities. Using one
   * gives a span with a border radius and no colour: exactly the
   * compiles-to-nothing failure this rule exists to catch. Build the pill from
   * token utilities the plugin emits itself.
   */
  deadBadge: (line: string) => /\bbadge-[a-z]+\b/.test(line),

  /** 3.1: no em dash in product text. */
  emDash: (line: string) => line.includes('—'),

  /** 8.11: destructive actions use the app modal, never a native dialog. */
  nativeDialog: (line: string) => /\bwindow\.(confirm|prompt|alert)\s*\(/.test(line),

  /** 4.4: the nine z layers have names. A raw number is an unplaceable layer. */
  rawZIndex: (line: string) => /\bz-(\[\s*\d|\d)/.test(line),

  /** 8.12: a panel sized to the window overhangs the host TopBar. */
  viewportAnchored: (line: string) =>
    /\b(min-)?h-screen\b/.test(line) || /height:\s*100vh/.test(line),

  /** 6.2: the host owns the bare Cmd/Ctrl+K chord for its palette. */
  stealsPaletteChord: (line: string) =>
    /(metaKey|ctrlKey)/.test(line) && /['"]k['"]/i.test(line) && !/shiftKey/.test(line),

  /** 8.1: the host TopBar already draws the plugin's name and description. */
  ownPageHeader: (line: string) => /<h1[\s>]/.test(line),
};

/**
 * 7.1, over a whole TSX source: a structural glyph carries `text-icon`. An icon
 * that does not must be inside an accent-filled control, where it inherits
 * `text-bg-primary` from the fill, or be a decorative empty-state glyph (8.9),
 * which is sized well beyond icon scale. Returns the 1-based offending lines.
 */
function bareIconOffenders(src: string): number[] {
  const offenders: number[] = [];
  const lines = src.split('\n');
  lines.forEach((l, i) => {
    const m = l.match(/<([A-Z][A-Za-z0-9]*) className="([^"]*)"\s*\/>/);
    if (!m) return;
    const classes = m[2];
    // Icon scale only: h-3.5, h-4, h-5. An h-8 glyph is empty-state art.
    if (!/\bh-(3\.5|4|5)\b/.test(classes)) return;
    if (/\btext-icon\b/.test(classes)) return;
    // An accent fill colours its own contents.
    const before = lines.slice(Math.max(0, i - 8), i + 1).join('\n');
    if (/variant="primary"/.test(before)) return;
    offenders.push(i + 1);
  });
  return offenders;
}

/**
 * 4.2: a labelled button in chrome is capped at 22px. The host's `size="sm"`
 * maps to shadcn `sm`, which is `h-8` (32px) - the exact trap 4.2.2 names - so
 * every chrome Button must override it. Empty-state and error-state calls to
 * action are exempt and say so at their site with `4.2-exempt`.
 */
function oversizedChromeButtons(src: string): number[] {
  const offenders: number[] = [];
  const lines = src.split('\n');
  lines.forEach((l, i) => {
    if (!/<Button\b/.test(l)) return;
    // The element may span lines; take it up to its closing bracket.
    const chunk = lines.slice(i, i + 12).join('\n');
    const el = chunk.slice(0, chunk.indexOf('>') + 1);
    if (!/size="sm"/.test(el)) return;
    if (/h-\[22px\]/.test(el)) return;
    const before = lines.slice(Math.max(0, i - 3), i).join('\n');
    if (/4\.2-exempt/.test(before)) return;
    offenders.push(i + 1);
  });
  return offenders;
}

// ── Walker guard ─────────────────────────────────────────────────────────────

describe('Blit design-system rules', () => {
  it('scans the plugin client, not an empty directory', () => {
    expect(ALL.length).toBeGreaterThan(15);
    expect(UI_FILES.length).toBeGreaterThanOrEqual(7);
    // The surfaces a violation would actually land on.
    for (const path of [
      'pages/BlitPage.tsx',
      'components/Toolbar.tsx',
      'components/InspectorPanel.tsx',
      'components/SketchesPanel.tsx',
      'components/SidePanel.tsx',
      'components/BlitCanvas.tsx',
      'components/CodePane.tsx',
      'styles.css',
    ]) {
      expect(
        UI_FILES.some((f) => f.path === path),
        `${path} is not being scanned`,
      ).toBe(true);
    }
    // ...and the engine is deliberately NOT in the colour scope.
    expect(UI_FILES.some((f) => f.path.startsWith('lib/'))).toBe(false);
  });

  it('1 has no hardcoded colour in chrome', () => {
    const bad: string[] = [];
    for (const f of UI_FILES) {
      stripComments(stripNeutralAlpha(stripFluentTokens(f.raw)))
        .split('\n')
        .forEach((l, i) => RULES.rawColor(l) && bad.push(`${f.path}:${i + 1}  ${l.trim()}`));
    }
    expect(bad).toEqual([]);
  });

  it('1 never uses a token this theme does not define', () => {
    const bad: string[] = [];
    for (const f of ALL) {
      f.raw.split('\n').forEach((l, i) => RULES.deadToken(l) && bad.push(`${f.path}:${i + 1}`));
    }
    expect(bad).toEqual([]);
  });

  it('2.4 never puts white on an accent or status fill', () => {
    const bad: string[] = [];
    for (const f of ALL) {
      f.raw.split('\n').forEach((l, i) => RULES.whiteOnFill(l) && bad.push(`${f.path}:${i + 1}`));
    }
    expect(bad).toEqual([]);
  });

  it('8.4 only uses badge classes the host defines', () => {
    const bad: string[] = [];
    for (const f of ALL) {
      f.raw
        .split('\n')
        .forEach((l, i) => RULES.deadBadge(l) && bad.push(`${f.path}:${i + 1}  ${l.trim()}`));
    }
    expect(bad).toEqual([]);
  });

  it('3.1 keeps em dashes out of product text', () => {
    const bad: string[] = [];
    for (const f of ALL) {
      stripComments(f.raw)
        .split('\n')
        .forEach((l, i) => RULES.emDash(l) && bad.push(`${f.path}:${i + 1}  ${l.trim()}`));
    }
    expect(bad).toEqual([]);
  });

  it('8.11 never calls window.confirm / prompt / alert', () => {
    const bad: string[] = [];
    for (const f of ALL) {
      stripComments(f.raw)
        .split('\n')
        .forEach((l, i) => RULES.nativeDialog(l) && bad.push(`${f.path}:${i + 1}`));
    }
    expect(bad).toEqual([]);
  });

  it('4.4 places every layer with a named z token', () => {
    const bad: string[] = [];
    for (const f of ALL) {
      f.raw.split('\n').forEach((l, i) => RULES.rawZIndex(l) && bad.push(`${f.path}:${i + 1}  ${l.trim()}`));
    }
    expect(bad).toEqual([]);
  });

  it('8.12 anchors no panel to the viewport', () => {
    const bad: string[] = [];
    for (const f of ALL) {
      f.raw
        .split('\n')
        .forEach((l, i) => RULES.viewportAnchored(l) && bad.push(`${f.path}:${i + 1}  ${l.trim()}`));
    }
    expect(bad).toEqual([]);
  });

  it('6.2 leaves the host its Cmd/Ctrl+K palette chord', () => {
    const bad: string[] = [];
    for (const f of ALL) {
      f.raw
        .split('\n')
        .forEach((l, i) => RULES.stealsPaletteChord(l) && bad.push(`${f.path}:${i + 1}`));
    }
    expect(bad).toEqual([]);
  });

  it('8.1 renders no page header of its own', () => {
    const bad: string[] = [];
    for (const f of ALL) {
      f.raw.split('\n').forEach((l, i) => RULES.ownPageHeader(l) && bad.push(`${f.path}:${i + 1}`));
    }
    expect(bad).toEqual([]);
  });

  it('7.1 puts structural icons on the icon token', () => {
    const bad: string[] = [];
    for (const f of UI_FILES) {
      if (!f.path.endsWith('.tsx')) continue;
      const lines = f.raw.split('\n');
      bareIconOffenders(f.raw).forEach((n) => bad.push(`${f.path}:${n}  ${lines[n - 1].trim()}`));
    }
    expect(bad).toEqual([]);
  });

  it('4.2 caps labelled chrome buttons at 22px', () => {
    const bad: string[] = [];
    for (const f of UI_FILES) {
      if (!f.path.endsWith('.tsx')) continue;
      const lines = f.raw.split('\n');
      oversizedChromeButtons(f.raw).forEach((n) => bad.push(`${f.path}:${n}  ${lines[n - 1].trim()}`));
    }
    expect(bad).toEqual([]);
  });

  // ── Fixtures: every matcher fired on a known violation ─────────────────────

  it('the line matchers still bite, and stay quiet on the compliant form', () => {
    expect(RULES.rawColor("style={{ color: '#3b82f6' }}")).toBe(true);
    expect(RULES.rawColor('  background: rgba(0, 0, 0, 0.5);')).toBe(true);
    expect(RULES.rawColor('className="bg-accent-light text-error"')).toBe(false);

    expect(RULES.deadToken('className="bg-accent text-accent-foreground"')).toBe(true);
    expect(RULES.deadToken('className="bg-accent text-bg-primary"')).toBe(false);

    expect(RULES.whiteOnFill('className="bg-accent text-white"')).toBe(true);
    expect(RULES.whiteOnFill('className="rounded bg-error px-2 text-white"')).toBe(true);
    expect(RULES.whiteOnFill('className="bg-accent text-bg-primary"')).toBe(false);
    expect(RULES.whiteOnFill('className="bg-black/45 text-white"')).toBe(false);

    expect(RULES.deadBadge('<span className="badge badge-secondary">x</span>')).toBe(true);
    // Defined by the host, purged from what it serves, so still dead in a plugin.
    expect(RULES.deadBadge('<span className="badge badge-warning">edited</span>')).toBe(true);
    expect(RULES.deadBadge('<span className="badge">unsaved</span>')).toBe(false);
    expect(RULES.deadBadge('<span className="bg-warning-light text-warning">edited</span>')).toBe(false);

    expect(RULES.emDash('<p>Export failed — try again.</p>')).toBe(true);
    expect(RULES.emDash('<p>Export failed. Try again.</p>')).toBe(false);

    expect(RULES.nativeDialog("if (window.confirm('Delete?')) remove();")).toBe(true);
    expect(RULES.nativeDialog("await confirm({ title: 'Delete?' })")).toBe(false);

    expect(RULES.rawZIndex('className="absolute z-20 flex"')).toBe(true);
    expect(RULES.rawZIndex('className="absolute z-[9999]"')).toBe(true);
    expect(RULES.rawZIndex('className="absolute z-drawer flex"')).toBe(false);

    expect(RULES.viewportAnchored('className="flex h-screen flex-col"')).toBe(true);
    expect(RULES.viewportAnchored('  height: 100vh;')).toBe(true);
    expect(RULES.viewportAnchored('className="flex h-full flex-col"')).toBe(false);
    // A scroll cap is a size, not an anchor, and must not fire.
    expect(RULES.viewportAnchored('className="max-h-[60vh] overflow-y-auto"')).toBe(false);

    expect(RULES.stealsPaletteChord("if ((e.metaKey || e.ctrlKey) && e.key === 'k') open();")).toBe(true);
    // Cmd/Ctrl+Shift+K is a different chord and is the plugin's to take.
    expect(
      RULES.stealsPaletteChord("if (e.ctrlKey && e.shiftKey && e.key === 'k') del();"),
    ).toBe(false);
    expect(RULES.stealsPaletteChord("if (e.ctrlKey && e.key === 'Enter') run();")).toBe(false);

    expect(RULES.ownPageHeader('<h1 className="text-lg">Blit</h1>')).toBe(true);
    expect(RULES.ownPageHeader('<h2 className="text-xs">Brush</h2>')).toBe(false);
  });

  it('the 7.1 icon check bites on a bare glyph and passes the two sanctioned forms', () => {
    const bad = ['<button type="button">', '  <X className="h-4 w-4" />', '</button>'].join('\n');
    expect(bareIconOffenders(bad)).toEqual([2]);

    const tokened = ['<button type="button">', '  <X className="h-4 w-4 text-icon" />'].join('\n');
    expect(bareIconOffenders(tokened)).toEqual([]);

    const onFill = ['<Button variant="primary" size="sm"', '  icon={<Sparkles className="h-3.5 w-3.5" />}'].join('\n');
    expect(bareIconOffenders(onFill)).toEqual([]);

    // Empty-state art is not an icon and is none of this rule's business.
    expect(bareIconOffenders('<Blocks className="h-8 w-8 text-text-muted" />')).toEqual([]);
  });

  it('the 4.2 button check bites on an unsized chrome button and honours the exemption', () => {
    const bad = ['<Button variant="secondary" size="sm" onClick={save}>', '  Save', '</Button>'].join('\n');
    expect(oversizedChromeButtons(bad)).toEqual([1]);

    const sized = ['<Button variant="secondary" size="sm" className="h-[22px]" onClick={save}>'].join('\n');
    expect(oversizedChromeButtons(sized)).toEqual([]);

    const exempt = [
      '{/* 4.2-exempt: an empty-state call to action, not chrome. */}',
      '<Button variant="secondary" size="sm" onClick={run}>',
    ].join('\n');
    expect(oversizedChromeButtons(exempt)).toEqual([]);

    // A multi-line element is still measured, not skipped.
    const multiline = ['<Button', '  variant="ghost"', '  size="sm"', '  onClick={onNew}', '>'].join('\n');
    expect(oversizedChromeButtons(multiline)).toEqual([1]);
  });

  it('the neutral-alpha exemption covers only the tagged sites', () => {
    const tagged = [
      '// blit-neutral-alpha: over arbitrary pixels.',
      "ctx.strokeStyle = 'rgba(128, 128, 128, 0.35)';",
      "const brand = '#0f6cbd';",
    ].join('\n');
    const hits: number[] = [];
    stripComments(stripNeutralAlpha(tagged))
      .split('\n')
      .forEach((l, i) => RULES.rawColor(l) && hits.push(i + 1));
    // The tagged rgba is exempt; the hex two lines down is not.
    expect(hits).toEqual([3]);
  });

  it('the Fluent exemption covers only what is between the markers', () => {
    const css = [
      '.bf-button { color: var(--fluent-neutral-foreground-2); }',
      '/* fluent-tokens:start */',
      ".blit-fluent { --fluent-brand-background: #115ea3; }",
      '/* fluent-tokens:end */',
      ".bf-tag { background: #292929; }",
    ].join('\n');
    const hits: number[] = [];
    stripComments(stripNeutralAlpha(stripFluentTokens(css)))
      .split('\n')
      .forEach((l, i) => RULES.rawColor(l) && hits.push(i + 1));
    // Line 3 is inside the block and exempt; line 5 is below it and is not.
    expect(hits).toEqual([5]);

    // Blanking, not deleting: the line the violation is reported on must still
    // be the line it is on in the file.
    expect(stripFluentTokens(css).split('\n')).toHaveLength(5);

    // And with no markers at all there is no exemption to claim.
    const unmarked = ".blit-fluent { --fluent-brand-background: #115ea3; }";
    expect(RULES.rawColor(stripFluentTokens(unmarked))).toBe(true);
  });

  it('stripComments blanks developer notes but keeps product copy', () => {
    expect(stripComments('const a = 1; // note — here').trim()).toBe('const a = 1;');
    expect(stripComments('{/* drawer — overlay */}').trim()).toBe('{}');
    expect(stripComments('<p>Keep — this</p>').trim()).toBe('<p>Keep — this</p>');
  });
});
