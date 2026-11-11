/**
 * The master bar's dialogs: settings, shortcuts, a text viewer for the docs and
 * changelog, and the command palette.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Input,
  Switch,
  makeStyles,
  tokens,
} from '@fluentui/react-components';

import { FluentButton } from './fluent';
import { setPrefs, usePrefs, type Prefs } from '../lib/prefs';

function Shell({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(_e, data) => !data.open && onClose()}>
      <DialogSurface style={wide ? { maxWidth: 820, width: '90vw' } : undefined}>
        <DialogBody>
          <DialogTitle>{title}</DialogTitle>
          <DialogContent>{children}</DialogContent>
          <DialogActions>
            <FluentButton appearance="secondary" onClick={onClose}>
              Close
            </FluentButton>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

// ── Settings ─────────────────────────────────────────────────────────────────

function NumberField({ label, k, min, max }: { label: string; k: keyof Prefs; min: number; max: number }) {
  const prefs = usePrefs();
  return (
    <Field label={label}>
      <Input
        type="number"
        min={min}
        max={max}
        value={String(prefs[k])}
        onChange={(_e, d) => {
          const n = Number(d.value);
          if (Number.isFinite(n)) setPrefs({ [k]: Math.min(max, Math.max(min, Math.round(n))) });
        }}
      />
    </Field>
  );
}

export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const prefs = usePrefs();
  return (
    <Shell open={open} onClose={onClose} title="Settings">
      <div className="flex flex-col gap-3">
        <Switch
          label="Live coding: re-run while typing"
          checked={prefs.live}
          onChange={(_e, d) => setPrefs({ live: d.checked })}
        />
        <NumberField label="Live delay after typing (ms)" k="liveDelay" min={0} max={3000} />
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Editor font size" k="fontSize" min={9} max={28} />
          <NumberField label="Tab width" k="tabSize" min={1} max={8} />
        </div>
        <Switch label="Wrap long lines" checked={prefs.lineWrap} onChange={(_e, d) => setPrefs({ lineWrap: d.checked })} />
        <div className="grid grid-cols-3 gap-3">
          <NumberField label="New sketch width" k="newW" min={1} max={256} />
          <NumberField label="New sketch height" k="newH" min={1} max={256} />
          <NumberField label="New sketch fps" k="newFps" min={1} max={60} />
        </div>
      </div>
    </Shell>
  );
}

// ── Shortcuts ────────────────────────────────────────────────────────────────

const SHORTCUTS: [string, string][] = [
  ['Ctrl+Enter', 'Run the sketch'],
  ['Ctrl+S', 'Save'],
  ['Ctrl+K', 'Command palette'],
  ['Space', 'Play / pause'],
  [', and .', 'Step back / forward one frame'],
  ['Ctrl+Z', 'Undo (also undoes paint strokes)'],
  ['Arrows / Shift+Arrows', 'Scene mode: nudge the picked sketch 1 / 8 px'],
  ['Esc', 'Let go of the picked sketch, close a drawer'],
  ['?', 'This list'],
];

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Shell open={open} onClose={onClose} title="Keyboard shortcuts">
      <table className="w-full text-sm">
        <tbody>
          {SHORTCUTS.map(([keys, what]) => (
            <tr key={keys}>
              <td className="whitespace-nowrap py-1 pr-4 font-mono">{keys}</td>
              <td className="py-1">{what}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Shell>
  );
}

// ── Text viewer (docs, changelog) ────────────────────────────────────────────

export function TextDialog({
  open,
  onClose,
  title,
  text,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  text: string;
}) {
  return (
    <Shell open={open} onClose={onClose} title={title} wide>
      <pre className="max-h-[65vh] overflow-auto whitespace-pre-wrap font-mono text-xs">{text}</pre>
    </Shell>
  );
}

// ── Command palette ──────────────────────────────────────────────────────────

const usePaletteStyles = makeStyles({
  active: { background: tokens.colorNeutralBackground1Selected },
});

export interface Command {
  label: string;
  /** Shown on the right: a shortcut or a group. */
  hint?: string;
  run: () => void;
}

export function CommandPalette({
  open,
  onClose,
  commands,
}: {
  open: boolean;
  onClose: () => void;
  commands: Command[];
}) {
  const styles = usePaletteStyles();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
    }
  }, [open]);

  const matches = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return commands
      .filter((c) => {
        const text = `${c.label} ${c.hint ?? ''}`.toLowerCase();
        return words.every((w) => text.includes(w));
      })
      .slice(0, 50);
  }, [commands, query]);

  const choose = (c: Command | undefined) => {
    if (!c) return;
    onClose();
    c.run();
  };

  return (
    <Dialog open={open} onOpenChange={(_e, data) => !data.open && onClose()}>
      <DialogSurface style={{ maxWidth: 560, padding: 12 }} aria-label="Command palette">
        <Input
          autoFocus
          className="w-full"
          placeholder="Type a command or sketch name"
          value={query}
          onChange={(_e, d) => {
            setQuery(d.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((i) => Math.min(matches.length - 1, i + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((i) => Math.max(0, i - 1));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              choose(matches[active]);
            }
          }}
        />
        <div className="mt-2 max-h-[50vh] overflow-auto" role="listbox">
          {matches.map((c, i) => (
            <div
              key={`${c.label}-${c.hint ?? ''}`}
              role="option"
              aria-selected={i === active}
              className={`flex cursor-pointer justify-between gap-4 rounded px-2 py-1.5 text-sm ${i === active ? styles.active : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(c)}
            >
              <span>{c.label}</span>
              {c.hint && <span className="opacity-60">{c.hint}</span>}
            </div>
          ))}
          {matches.length === 0 && <div className="px-2 py-1.5 text-sm opacity-60">Nothing matches.</div>}
        </div>
      </DialogSurface>
    </Dialog>
  );
}
