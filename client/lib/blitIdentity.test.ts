/**
 * The boundary around Blit's Fluent 2 chrome.
 *
 * Blit's chrome is the real `@fluentui/react-components` v9 design system — the
 * same library the host shares as a Module Federation singleton — themed to
 * Blit's own violet identity rather than Fluent's default blue. That is a bounded
 * exception to Core's chrome, and these are the bounds it still has to keep:
 *
 *  1. The Fluent BRAND is declared exactly ONCE, in `lib/blitTheme.ts`: a
 *     `BrandVariants` ramp seeded from violet at Fluent's primary slot, turned
 *     into a light and a dark theme. Nowhere else builds a Fluent theme.
 *  2. The old hand-authored `--fluent-*` token skin is GONE. No file references
 *     a `--fluent-*` custom property, and `styles.css` carries no `.bf-*` rule
 *     and no `fluent-tokens` block; colour and elevation come from the theme's
 *     `tokens.*` through Griffel `makeStyles`.
 *  3. Blit themes only its OWN subtree: a `<FluentProvider>` wraps each layout,
 *     scoped by the `blit-fluent` marker, keyed off the host's `data-theme`
 *     signal — never the document root, never a preference of Blit's own.
 *  4. The code keeps its CodeMirror theme. It is the one surface where a foreign
 *     palette would fight the thing it is colouring.
 *  5. Blit's Fluent is the shared LIBRARY. It never imports another plugin's copy.
 *
 * Every one of these is a rule no compiler, linter or screenshot enforces.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLIENT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const STYLES = readFileSync(join(CLIENT, 'styles.css'), 'utf8');

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(tsx?|css)$/.test(name) && !name.includes('.test.')) out.push(full);
  }
  return out;
}

const FILES = sourceFiles(CLIENT).map((path) => ({
  path: path.slice(CLIENT.length + 1).split(sep).join('/'),
  raw: readFileSync(path, 'utf8'),
}));

const byPath = (p: string) => FILES.find((f) => f.path === p);

describe('Blit is the real Fluent 2 library, and the exception is bounded', () => {
  it('declares its Fluent brand exactly once, in lib/blitTheme.ts', () => {
    const theme = byPath('lib/blitTheme.ts');
    expect(theme, 'lib/blitTheme.ts moved').toBeDefined();
    expect(theme!.raw).toMatch(/createLightTheme/);
    expect(theme!.raw).toMatch(/createDarkTheme/);
    expect(theme!.raw).toMatch(/BrandVariants/);
    // Seeded from violet at Fluent's primary slot (80).
    expect(theme!.raw).toMatch(/80:\s*'#7C5CFF'/i);
    // A full 16-slot ramp (10 → 160), and nothing but the ramp.
    expect((theme!.raw.match(/'#[0-9A-Fa-f]{6}'/g) ?? [])).toHaveLength(16);

    // No OTHER file builds a Fluent theme or a brand ramp: the brand lives here.
    for (const f of FILES) {
      if (f.path === 'lib/blitTheme.ts') continue;
      expect(f.raw, `${f.path} builds its own Fluent theme`).not.toMatch(
        /create(Light|Dark)Theme|BrandVariants/,
      );
    }
  });

  it('has retired the hand-authored --fluent-* token skin', () => {
    for (const f of FILES) {
      expect(f.raw, `${f.path} still references a --fluent-* token`).not.toMatch(/--fluent-/);
    }
    // The stylesheet keeps layout only: no token markers, no `.bf-*` skin.
    expect(STYLES, 'the fluent-tokens markers are still in styles.css').not.toMatch(
      /fluent-tokens:(start|end)/,
    );
    expect(STYLES, 'a `.bf-*` colour rule survived in styles.css').not.toMatch(/\.bf-/);
  });

  it('builds its chrome from the shared Fluent library and its tokens', () => {
    for (const p of ['components/fluent.tsx', 'components/fluentPanels.tsx', 'components/chrome.ts']) {
      const f = byPath(p);
      expect(f, `${p} moved`).toBeDefined();
      expect(f!.raw, `${p} does not use the Fluent library`).toMatch(/from '@fluentui\/react-components'/);
    }
    // Surfaces that are not a single Fluent component take their colour and
    // elevation from the theme's tokens, not a hand-authored value.
    expect(byPath('components/chrome.ts')!.raw).toMatch(/tokens\.color/);
  });

  it('themes only its own subtree, off the host theme signal', () => {
    const page = byPath('pages/BlitPage.tsx');
    expect(page, 'BlitPage.tsx moved').toBeDefined();
    expect(page!.raw).toMatch(/import\s*\{[^}]*\bFluentProvider\b[^}]*\}\s*from '@fluentui\/react-components'/s);
    // Both layouts wrap in a provider...
    expect(page!.raw.match(/<FluentProvider\b/g) ?? []).toHaveLength(2);
    // ...scoped by the marker class, so the tokens resolve on Blit's subtree and
    // not on the host shell...
    expect(page!.raw.match(/blit-fluent/g) ?? []).toHaveLength(2);
    // ...with the theme keyed off the host's own `data-theme` signal.
    expect(page!.raw).toMatch(/fluentThemeFor\(useHostTheme\(\)\)/);

    // And the hook it reads is the shared `data-theme` attribute, watched — not
    // the host's React context, which Module Federation would split.
    const hooks = byPath('hooks/useIsMobile.ts');
    expect(hooks!.raw).toMatch(/getAttribute\('data-theme'\)/);
    expect(hooks!.raw).toMatch(/MutationObserver/);
  });

  it('pins the theme without emitting a layout box, so the height chain survives', () => {
    // The real `<FluentProvider>` renders a block-level `<div>` at `height: auto`.
    // Put between the host's full-height page and Blit's `height: 100%` flex chain,
    // that block box breaks the chain — the canvas collapses to zero height (present
    // in the DOM, invisible: "the sketch does not load") or the layout overflows as
    // a vertical stack. The provider is therefore a `display: contents` theme pin —
    // its custom properties still cascade — and the flex layout root is a SEPARATE
    // element nested inside it.
    const chrome = byPath('components/chrome.ts');
    expect(chrome, 'components/chrome.ts moved').toBeDefined();
    expect(chrome!.raw, 'chrome.ts has no display:contents theme pin').toMatch(
      /fluentPin:\s*\{[^}]*display:\s*'contents'/s,
    );

    const page = byPath('pages/BlitPage.tsx')!;
    // Each `<FluentProvider>` opening tag is the pin and NOTHING else: it carries
    // `chrome.fluentPin` and none of the flex layout that must live on a real box.
    const providers = page.raw.match(/<FluentProvider\b[^>]*>/g) ?? [];
    expect(providers).toHaveLength(2);
    for (const tag of providers) {
      expect(tag, `a FluentProvider is not the display:contents pin: ${tag}`).toMatch(
        /className=\{chrome\.fluentPin\}/,
      );
      // The layout box (flex / h-full / the tinted canvas) must NOT sit on the
      // provider itself — that is the block-box-in-the-flex-chain regression.
      expect(tag, `the layout still sits on the FluentProvider box: ${tag}`).not.toMatch(
        /\bflex\b|h-full|chrome\.canvas/,
      );
    }
    // The layout instead lives on the marker div nested directly inside each pin.
    expect(
      page.raw.match(/className=\{chrome\.fluentPin\}>\s*<div className=\{`blit-fluent \$\{chrome\.canvas\}[^`]*`\}/g) ?? [],
      'the blit-fluent flex layout root is not nested inside the pin',
    ).toHaveLength(2);
  });

  it('leaves the code its own theme', () => {
    // CodeMirror keeps `oneDark` / light. It takes nothing from Fluent — a
    // foreign palette is the one thing that would fight the syntax colours.
    const pane = byPath('components/CodePane.tsx');
    expect(pane, 'CodePane.tsx moved').toBeDefined();
    expect(pane!.raw).toMatch(/oneDark/);
    expect(pane!.raw, 'the editor pulled in Fluent chrome').not.toMatch(/@fluentui\/react-components/);
    expect(pane!.raw, 'the editor took a Fluent colour token').not.toMatch(/tokens\.color/);
  });

  it('never reaches into another plugin for it', () => {
    // Blit's Fluent is the shared LIBRARY, not another plugin's copy. A
    // cross-plugin import would not resolve at runtime anyway: each plugin is its
    // own federated bundle.
    for (const f of FILES) {
      expect(f.raw, `${f.path} imports across plugins`).not.toMatch(
        /from\s+['"](?:\.\.\/)+(?:strudel|[a-z-]+)\/client\//,
      );
      expect(f.raw, `${f.path} uses Strudel's class prefix`).not.toMatch(/\bsf-[a-z]|strudel-fluent/);
    }
  });
});
