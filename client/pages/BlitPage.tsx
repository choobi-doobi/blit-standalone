/**
 * Blit: a live-coding REPL for pixel art.
 *
 * The state model has one subtlety worth knowing before changing anything here.
 * There are TWO versions of the sketch at any moment:
 *
 *   `code`    is the editor buffer, which changes on every keystroke.
 *   `ranCode` is the text that produced the pattern currently on the canvas.
 *
 * They diverge while you type and converge on Ctrl+Enter. That is the live-coding
 * contract: the canvas keeps playing the last thing you committed. Painting has
 * to respect it, because the sprite literal offsets a click resolves to belong to
 * whichever text was evaluated, so `paint` evaluates the buffer first when the two
 * differ and then edits the buffer. Mixing them up writes an edit at the wrong
 * offset and corrupts the source.
 *
 * The frame counter lives in a `FrameClock` shared with the canvas so it survives
 * re-evaluation: an edit refines the animation instead of restarting it. It is a
 * subscribable store rather than page state because the render loop advances it up
 * to sixty times a second; only the readout in the command bar listens, so the
 * editor is never re-rendered by the animation. See lib/frameClock.
 *
 * A THIRD version exists on disk: the draft in localStorage, so a refresh does not
 * throw away unsaved keystrokes. It is measured against `reference` — the saved
 * sketch when there is one, the text the sketch was seeded from when there is not
 * — and that one concept is what makes the autosave effect correct: a draft is
 * written only when the buffer differs from its reference, and the same effect
 * clears it when they agree. See lib/draft.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { isolateHistory } from '@codemirror/commands';
import type { EditorView } from '@codemirror/view';
import { AppsRegular, DismissRegular, LayerRegular, OptionsRegular } from '@fluentui/react-icons';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  FluentProvider,
} from '@fluentui/react-components';

import { shouldIgnoreKey } from '../sdk/keys';
import { toast } from '../sdk/toast';

import { foldersApi, importApi, sketchesApi, type FolderRecord, type SketchSummary } from '../api';
import BlitCanvas, { type CanvasMode } from '../components/BlitCanvas';
import { FluentButton } from '../components/fluent';
import { FluentBody, FluentMessageBar, FluentTag } from '../components/fluentPanels';
import { useChromeStyles } from '../components/chrome';
import { fluentThemeFor } from '../lib/blitTheme';
import CodePane from '../components/CodePane';
import InspectorPanel from '../components/InspectorPanel';
import SidePanel from '../components/SidePanel';
import SplitHandle from '../components/SplitHandle';
import SketchesPanel from '../components/SketchesPanel';
import Toolbar from '../components/Toolbar';
import MasterBar from '../components/MasterBar';
import {
  CommandPalette,
  SettingsDialog,
  ShortcutsDialog,
  TextDialog,
  type Command,
} from '../components/AppDialogs';
import { getPrefs, setPrefs, usePrefs } from '../lib/prefs';
import { startMic, type Mic } from '../lib/micAudio';
import { RAMPS } from '../lib/blit/palettes';
import { ZOOMS } from '../lib/zoom';
import languageDoc from '../../docs/language.md?raw';
import changelog from '../../CHANGELOG.md?raw';
import pkg from '../../package.json';
import type { Site } from '../lib/blit/errorSite';
import { BlitError, DEFAULT_SETTINGS, evaluateSketch, type Sketch } from '../lib/blit/evaluate';
import { pokeChar } from '../lib/blit/source';
import { blitCallText, callRange, insertBlit, moveBlitCall, movableCalls } from '../lib/blit/sceneEdit';
import { carriesSketch, createBlitLibrary, sketchFromDrop } from '../lib/blitLibrary';
import type { SpriteHit } from '../lib/blit/pattern';
import type { RenderOptions } from '../lib/blit/render';
import {
  isPlayPauseChord,
  isSaveChord,
  isStepBackChord,
  isStepForwardChord,
  wouldActivateFocused,
} from '../lib/chords';
import {
  DRAFT_DEBOUNCE_MS,
  clearDraft,
  draftRestore,
  readDraft,
  writeDraft,
  type RestoreKind,
} from '../lib/draft';
import { forwardToEditor, undoChord } from '../lib/editorUndo';
import { createFrameClock, stepBack, type FrameClock } from '../lib/frameClock';
import { decodePngBytes, fileStem, imageFromDrop, isPng, pngSize, toBase64 } from '../lib/decodeImage';
import { exportAnimation, exportAseprite, exportFrame, exportSheet, exportSource } from '../lib/exportImage';
import {
  IMPORT_MAX_COLORS,
  IMPORT_MAX_SIDE,
  IMPORT_MAX_SOURCE,
  importRgba,
  sketchSource,
  spriteExpression,
  tooBigSourceReason,
  type ImportedSprite,
} from '../lib/blit/importImage';
import type { DownscaleOption } from '../lib/blit/resample';
import { STARTER, type Example } from '../lib/examples';
import { usePanelState } from '../lib/panelState';
import { DEFAULT_ZOOM, normalizeZoom } from '../lib/zoom';
import { useWorkbench } from '../lib/workbench';
import { prefersReducedMotion, useHostTheme, useLayoutMode } from '../hooks/useIsMobile';

interface RunFailure {
  phase: 'compile' | 'run' | 'render';
  message: string;
  /** Where in the buffer, when it could be established. See lib/blit/errorSite. */
  site: Site | null;
}

type Drawer = 'sketches' | 'inspector' | null;
type AppDialog = 'settings' | 'shortcuts' | 'docs' | 'changelog' | null;

/** A blank sketch at the sizes chosen in Settings. */
function newSketchCode(): string {
  const { newW, newH, newFps } = getPrefs();
  return `size(${newW}, ${newH});\nfps(${newFps});\n\nout(sprite(\`\n  .ww.\n  wwww\n  wwww\n  .ww.\n\`).scale(2).center());\n`;
}

const RAMP_CALL = /ramp\(\s*['"`][^'"`]*['"`]\s*\)/;

/** Set the sketch's ramp: rewrite its `ramp()` call, or add one after `size()`. */
function withRamp(code: string, name: string): string {
  const call = `ramp('${name}')`;
  if (RAMP_CALL.test(code)) return code.replace(RAMP_CALL, call);
  const size = /^size\([^)]*\);?[^\n]*\n/m.exec(code);
  if (!size) return `${call};\n${code}`;
  const at = size.index + size[0].length;
  return `${code.slice(0, at)}${call};\n${code.slice(at)}`;
}

/** Scene mode's nudge directions. */
const ARROWS: Record<string, [number, number] | undefined> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/**
 * The sketch as the server holds it, and what "unsaved" is measured against.
 *
 * The zoom belongs here because it is saved with the sketch: a canvas being
 * looked at from a different distance than the stored one is a real difference,
 * and Save is what closes it.
 */
interface Saved {
  name: string;
  code: string;
  zoom: number;
}

/**
 * A PNG that has been read but not imported, because its size is still a choice.
 *
 * The base64 is held rather than the File: the size is picked after the fact, and
 * each pick posts the same bytes again. Re-reading the file per attempt would work
 * too, but a File handle can go stale while a dialog is open and re-encoding it is
 * the one part of this that is not cheap.
 */
interface PendingImport {
  /** The file's name without its extension, for naming the sketch. */
  stem: string;
  png: string;
  width: number;
  height: number;
  options: DownscaleOption[];
  /** Why there is no sprite yet: needs a size, or that size had too many colours. */
  refusal: string | null;
}

/**
 * What the size chooser says above its chips.
 *
 * Names the exact size rather than saying "one of them", because the whole value
 * of detecting it is that the person can go straight to it, and hunting for which
 * chip is meant would give that back.
 */
function chooserPrompt(pending: PendingImport): string {
  const exact = pending.options.find((option) => option.exact);
  return (
    `${pending.stem}.png is ${pending.width}x${pending.height}, and a sprite grid stops at ` +
    `${IMPORT_MAX_SIDE}x${IMPORT_MAX_SIDE}. Pick a size; the number after the dot is how many colours it ` +
    `would have, out of the ${IMPORT_MAX_COLORS} a grid can name.` +
    (exact ? ` ${exact.width}x${exact.height} loses nothing: this image is that sprite scaled up.` : '')
  );
}

/** What the buffer holds on a cold mount: the starter, or a draft left behind. */
function boot(): {
  name: string;
  code: string;
  seed: { name: string; code: string };
  restored: RestoreKind;
} {
  const starter = { name: STARTER.name, code: STARTER.code };
  const { kind, draft } = draftRestore(readDraft(null), starter);
  if (!draft) return { ...starter, seed: starter, restored: 'none' };
  // The draft records the code it was typed on but not the name that went with
  // it, so Discard reverts the TEXT and leaves the name alone. For an unsaved
  // sketch there is no saved name to go back to, which is the whole reason it is
  // still a draft.
  return {
    name: draft.name,
    code: draft.code,
    seed: { name: draft.name, code: draft.base },
    restored: kind,
  };
}

export default function BlitPage() {
  const queryClient = useQueryClient();
  const mode = useLayoutMode();
  const chrome = useChromeStyles();
  const fluentTheme = fluentThemeFor(useHostTheme());

  // Read once, before any state: both the buffer and the notice come out of the
  // same decision, and reading localStorage twice could disagree with itself.
  const bootRef = useRef<ReturnType<typeof boot> | null>(null);
  bootRef.current ??= boot();
  const opened = bootRef.current;

  const [code, setCode] = useState(opened.code);
  const [ranCode, setRanCode] = useState(opened.code);
  const [sketch, setSketch] = useState<Sketch | null>(() => {
    try {
      // Nothing is fetched yet, so every placed sketch is still on its way: the
      // rest of a scene draws now and the placed ones join when the list lands.
      return evaluateSketch(opened.code, { blits: () => ({ kind: 'loading' }) });
    } catch {
      return null;
    }
  });
  const [failure, setFailure] = useState<RunFailure | null>(null);

  const [name, setName] = useState(opened.name);
  const [sketchId, setSketchId] = useState<number | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState<Saved | null>(null);
  /** The text this sketch was seeded from, when nothing is saved to compare to. */
  const [seed, setSeed] = useState(opened.seed);
  const [restored, setRestored] = useState<RestoreKind>(opened.restored);
  const [pendingDelete, setPendingDelete] = useState<SketchSummary | null>(null);
  const [pendingFolderDelete, setPendingFolderDelete] = useState<FolderRecord | null>(null);
  /** Where the sketch in the buffer is filed when it is first saved. */
  const [newFolder, setNewFolder] = useState<number | null>(null);

  // Animated by default, but not at someone who has asked the OS for less
  // motion: they get frame 0 and the Play button, which is a choice rather than
  // something happening to them. Read once, so pressing Play still wins.
  const [playing, setPlaying] = useState(() => !prefersReducedMotion());
  // Where an UNSAVED sketch starts. A saved one opens at the zoom it was saved
  // at, which arrives with the row and is applied in `adopt`.
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [showGrid, setShowGrid] = useState(false);
  const [paintChar, setPaintChar] = useState('w');
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [exporting, setExporting] = useState(false);
  /** What is over the stage, so the drop target can say what a drop will do. */
  const [dropping, setDropping] = useState<'image' | 'sketch' | null>(null);
  /** A picked PNG too big for a grid, waiting for the size to emit it at. */
  const [pending, setPending] = useState<PendingImport | null>(null);
  /** Paint characters, or place and move other sketches. See README, "Scenes". */
  const [canvasMode, setCanvasMode] = useState<CanvasMode>('paint');
  /** The placed sketch scene mode has picked, by its `blit(` call's index. */
  const [selectedBlit, setSelectedBlit] = useState<number | null>(null);
  const prefs = usePrefs();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [dialog, setDialog] = useState<AppDialog>(null);
  const [mic, setMic] = useState<Mic | null>(null);
  useEffect(() => () => mic?.stop(), [mic]);

  // Created once. The canvas advances it, the readout subscribes to it, the paint
  // path and the exporters read it exactly.
  const clockRef = useRef<FrameClock | null>(null);
  clockRef.current ??= createFrameClock();
  const clock = clockRef.current;
  const codeRef = useRef(code);
  codeRef.current = code;
  const ranCodeRef = useRef(ranCode);
  ranCodeRef.current = ranCode;
  /**
   * The saved id the buffer belongs to, for the evaluator: a sketch may not
   * place itself. A ref because `evaluate` is identity-stable, and written
   * directly by `adopt` too, which evaluates before the state has landed.
   */
  const sketchIdRef = useRef(sketchId);
  sketchIdRef.current = sketchId;
  /** The sketches a scene can place, fetched on demand. See lib/blitLibrary. */
  const libraryRef = useRef<ReturnType<typeof createBlitLibrary> | null>(null);
  libraryRef.current ??= createBlitLibrary((id) => sketchesApi.get(id));
  const library = libraryRef.current;
  /** The list rows placed sketches resolve against; see the list query below. */
  const rowsRef = useRef<SketchSummary[] | undefined>(undefined);
  /** The editor, so undo can be driven from outside it. See lib/editorUndo. */
  const viewRef = useRef<EditorView | null>(null);

  const left = usePanelState('sketches', 240);
  const right = usePanelState('inspector', 264);
  const workbench = useWorkbench();

  // Side by side needs two columns' worth of width, so the narrow layout keeps
  // the canvas above the editor whatever was chosen on a bigger screen. The
  // choice is remembered, not overwritten: a phone does not get to decide what
  // the desktop looks like.
  const columns = mode !== 'small' && workbench.layout === 'columns';

  const settings = sketch?.settings ?? DEFAULT_SETTINGS;
  const dirty = code !== ranCode;
  // Zoom counts: it is part of the saved row now, so a sketch looked at from a
  // different distance than the one stored really does have something to save.
  const unsaved =
    savedSnapshot === null ||
    savedSnapshot.code !== code ||
    savedSnapshot.name !== name ||
    savedSnapshot.zoom !== zoom;

  /** What the buffer is measured against: the saved sketch, or what it was seeded from. */
  const reference = savedSnapshot ?? seed;
  /** Is there anything in the buffer a draft would preserve? */
  const draftworthy = code !== reference.code || name !== reference.name;

  const renderOptions = useCallback(
    (frame: number): RenderOptions => ({
      w: settings.w,
      h: settings.h,
      frame,
      fps: settings.fps,
      cycle: settings.cycle,
      ramp: settings.ramp,
    }),
    [settings],
  );

  // ── Running ───────────────────────────────────────────────────────────────

  /**
   * Evaluate `source`, adopt it, and report what went wrong if it did.
   *
   * A scene whose placed sketches are not fetched yet evaluates with them drawing
   * nothing; they are fetched, and the SAME text is evaluated again once they
   * land, unless something else has been run in the meantime.
   */
  const evaluateRef = useRef<(source: string) => Sketch | null>(() => null);
  const evaluate = useCallback((source: string): Sketch | null => {
    const missing = new Set<number>();
    try {
      const next = evaluateSketch(source, {
        blits: library.resolver(rowsRef.current, missing),
        selfId: sketchIdRef.current,
      });
      setSketch(next);
      setRanCode(source);
      ranCodeRef.current = source;
      setFailure(null);
      const rows = rowsRef.current;
      if (missing.size > 0 && rows) {
        void library.load(missing, rows).then(() => {
          if (ranCodeRef.current === source) evaluateRef.current(source);
        });
      }
      return next;
    } catch (error) {
      const blit = error instanceof BlitError ? error : null;
      setFailure({
        phase: blit?.phase ?? 'run',
        message: error instanceof Error ? error.message : String(error),
        site: blit?.site ?? null,
      });
      return null;
    }
  }, [library]);
  evaluateRef.current = evaluate;

  // Read through a ref so this stays identity-stable: it is baked into the
  // editor's keymap, and a new identity per keystroke would reconfigure
  // CodeMirror on every character.
  const run = useCallback(() => {
    evaluate(codeRef.current);
  }, [evaluate]);

  // Live coding: run the buffer a moment after typing stops. A failed run keeps
  // the last good sketch on the canvas and shows the error, so typing through a
  // half-finished expression never blanks the picture.
  // Undoing back to the last good text still has to clear the error, hence the
  // failure check; read through a ref so a failure does not re-trigger a run.
  const failureRef = useRef(failure);
  failureRef.current = failure;
  useEffect(() => {
    if (!prefs.live || (code === ranCodeRef.current && !failureRef.current)) return;
    const timer = setTimeout(() => evaluate(code), prefs.liveDelay);
    return () => clearTimeout(timer);
  }, [code, prefs.live, prefs.liveDelay, evaluate]);

  useEffect(() => {
    if (drawer === null) return;
    const onEscape = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      setDrawer(null);
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [drawer]);

  // ── Painting ──────────────────────────────────────────────────────────────

  const paint = useCallback(
    (hit: SpriteHit | null, erase: boolean, strokeStart: boolean) => {
      if (!hit) return;

      // The offsets in `hit` belong to whatever text was evaluated. When the
      // buffer has moved on, commit it first so the offsets and the buffer agree.
      const active = dirty ? evaluate(codeRef.current) : sketch;
      if (!active) return;

      const literal = active.literals.find((l) => l.id === hit.sourceId);
      const grid = active.grids.get(hit.sourceId);
      if (!literal || !grid) return;

      const next = pokeChar(codeRef.current, literal, grid, hit, erase ? '.' : paintChar);
      if (next === codeRef.current) return;

      // Write through the editor rather than only through React state, so the
      // edit joins the undo history on OUR terms. `isolateHistory` on the first
      // cell of a gesture closes the previous group, which makes one stroke
      // exactly one undo step: without it CodeMirror groups by elapsed time, so
      // a fast drag was one undo and a slow one was several, and how many times
      // you had to press Ctrl+Z depended on how quickly you had moved the mouse.
      const view = viewRef.current;
      if (view) {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: next },
          annotations: strokeStart ? isolateHistory.of('before') : undefined,
        });
      }
      setCode(next);
      evaluate(next);
    },
    [dirty, evaluate, sketch, paintChar],
  );

  // ── Scenes ────────────────────────────────────────────────────────────────
  //
  // Scene mode writes source, the same as a paint stroke does: moving a placed
  // sketch rewrites the numbers in its `blit()` call, and placing one adds a
  // call. Each goes through the editor as its own undo step.

  /** Put new text in the buffer as one undo step, and run it. */
  const writeCode = useCallback(
    (next: string): Sketch | null => {
      const view = viewRef.current;
      if (view) {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: next },
          annotations: isolateHistory.of('before'),
        });
      }
      setCode(next);
      return evaluate(next);
    },
    [evaluate],
  );

  /** Which placed sketches a drag may move: resolved, one call each, plain numbers. */
  const movable = useMemo(() => {
    if (!sketch) return new Set<number>();
    const candidates = sketch.blits.filter((call) => {
      const instance = sketch.instances.get(call.id);
      return instance !== undefined && !instance.repeated && instance.sketchId !== null;
    });
    return movableCalls(ranCode, candidates);
  }, [sketch, ranCode]);

  const moveBlit = useCallback(
    (id: number, x: number, y: number) => {
      // As with painting: the call offsets belong to the text that was run.
      const active = dirty ? evaluate(codeRef.current) : sketch;
      const call = active?.blits.find((c) => c.id === id);
      if (!call) return;
      const next = moveBlitCall(codeRef.current, call.open, x, y);
      if (next === null) {
        toast({ type: 'warning', message: 'That one is placed by an expression, so move it in the code.' });
        evaluate(codeRef.current);
        return;
      }
      if (next !== codeRef.current) writeCode(next);
    },
    [dirty, evaluate, sketch, writeCode],
  );

  const placedRows = useMemo(
    () =>
      sketch
        ? [...sketch.instances.values()].map((instance) => ({
            id: instance.id,
            name: instance.name,
            x: instance.pos.x,
            y: instance.pos.y,
            movable: movable.has(instance.id),
            loading: instance.sketchId === null,
          }))
        : [],
    [sketch, movable],
  );

  /** Pick a placed sketch, and select its call in the editor so the code says which. */
  const selectBlit = useCallback(
    (id: number | null) => {
      setSelectedBlit(id);
      const call = id === null ? undefined : sketch?.blits.find((c) => c.id === id);
      const view = viewRef.current;
      if (!call || !view || dirty) return;
      const range = callRange(ranCode, call.start, call.open);
      if (range && range.to <= view.state.doc.length) {
        view.dispatch({ selection: { anchor: range.from, head: range.to }, scrollIntoView: true });
      }
    },
    [sketch, dirty, ranCode],
  );

  /**
   * Place a saved sketch into this one: centred on the canvas, or on `at`.
   *
   * By name when the name is unique, because `blit('Coin', 40, 12)` is the line a
   * person can read; by id otherwise, because a name two sketches share would
   * be refused the moment it ran.
   */
  const placeSketch = useCallback(
    async (row: SketchSummary, at?: { x: number; y: number }) => {
      const rows = rowsRef.current ?? [];
      if (row.id === sketchIdRef.current) {
        toast({ type: 'warning', message: "A sketch can't be placed inside itself." });
        return;
      }
      await library.load([row.id], rows);
      const source = library.cached(row);
      let size = { w: 0, h: 0 };
      if (source) {
        try {
          const child = evaluateSketch(source.code, {
            blits: library.resolver(rows, new Set()),
            selfId: row.id,
          });
          size = { w: child.settings.w, h: child.settings.h };
        } catch {
          // It is placed anyway, and says what is wrong with it when it runs.
        }
      }
      const scene = sketch?.settings ?? DEFAULT_SETTINGS;
      const x = at ? at.x - Math.floor(size.w / 2) : Math.floor((scene.w - size.w) / 2);
      const y = at ? at.y - Math.floor(size.h / 2) : Math.floor((scene.h - size.h) / 2);
      const unique = rows.filter((r) => r.name === row.name).length === 1;
      const inserted = insertBlit(codeRef.current, blitCallText(unique ? row.name : row.id, x, y));
      if (!inserted) {
        toast({
          type: 'warning',
          message: "Couldn't tell where this sketch's layers are. Wrap them in scene(...) and place it again.",
        });
        return;
      }
      const next = writeCode(inserted.code);
      setCanvasMode('scene');
      setSelectedBlit(next?.blits.find((c) => c.start === inserted.at)?.id ?? null);
    },
    [library, sketch, writeCode],
  );

  // ── Sketches ──────────────────────────────────────────────────────────────

  const list = useQuery({ queryKey: ['blit', 'sketches'], queryFn: sketchesApi.list });
  const folderList = useQuery({ queryKey: ['blit', 'folders'], queryFn: foldersApi.list });
  rowsRef.current = list.data;
  const sketchRowsById = useMemo(() => new Map((list.data ?? []).map((row) => [row.id, row])), [list.data]);
  /** What the Scene section offers to place: everything saved but this sketch, by name. */
  const placeable = useMemo(
    () => (list.data ?? []).filter((row) => row.id !== sketchId).sort((a, b) => a.name.localeCompare(b.name)),
    [list.data, sketchId],
  );

  // A new list is what placed sketches resolve against: the first one lets a
  // scene opened cold find its layers, and a later one carries a placed sketch
  // saved since, whose `updated_at` moved. Only a scene has anything to redo.
  const sceneRan = (sketch?.blits.length ?? 0) > 0;
  useEffect(() => {
    if (sceneRan) evaluateRef.current(ranCodeRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the list is the trigger, not the scene flag
  }, [list.data]);

  /**
   * Open something into the buffer.
   *
   * `saved` is the text the server holds, which is NOT always the text being
   * adopted: opening a sketch with a draft on disk puts the draft in the buffer
   * while the snapshot stays the saved row, so the toolbar still reads "unsaved"
   * and Save writes what is on screen.
   */
  const adopt = useCallback(
    (nextName: string, nextCode: string, id: number | null, saved: Saved | null, kind: RestoreKind = 'none') => {
      setName(nextName);
      setCode(nextCode);
      setSketchId(id);
      sketchIdRef.current = id;
      setSelectedBlit(null);
      setNewFolder(null);
      setSavedSnapshot(saved);
      // The draft is the TEXT, never the view: a sketch opens at the zoom the
      // server holds, and one that has never been saved starts at the default.
      setZoom(saved ? saved.zoom : DEFAULT_ZOOM);
      // With nothing saved to compare against, the text as opened IS the
      // reference, so an untouched example never leaves a draft behind.
      setSeed(saved ?? { name: nextName, code: nextCode });
      setRestored(kind);
      clock.set(0);
      evaluate(nextCode);
    },
    [clock, evaluate],
  );

  const open = useMutation({
    mutationFn: sketchesApi.get,
    onSuccess: (row) => {
      const saved = { name: row.name, code: row.code, zoom: normalizeZoom(row.zoom) };
      const { kind, draft } = draftRestore(readDraft(row.id), saved);
      adopt(draft?.name ?? row.name, draft?.code ?? row.code, row.id, saved, kind);
    },
    onError: () => toast({ type: 'error', message: "Couldn't open that sketch." }),
  });

  // `?sketch=<id>` opens that saved sketch, so a sketch can be linked to. The
  // param is consumed as soon as it is read, so a later refresh does not snap
  // back to it.
  const [searchParams, setSearchParams] = useSearchParams();
  const linkedSketch = searchParams.get('sketch');
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => {
    if (linkedSketch === null) return;
    const id = Number.parseInt(linkedSketch, 10);
    if (Number.isFinite(id) && id > 0) openRef.current.mutate(id);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('sketch');
        return next;
      },
      { replace: true },
    );
  }, [linkedSketch, setSearchParams]);

  const save = useMutation({
    mutationFn: async (): Promise<number> => {
      const trimmed = name.trim() || 'Untitled';
      if (sketchId === null) return (await sketchesApi.create(trimmed, code, zoom, newFolder)).id;
      await sketchesApi.update(sketchId, { name: trimmed, code, zoom });
      return sketchId;
    },
    onSuccess: (id) => {
      setSketchId(id);
      setSavedSnapshot({ name: name.trim() || 'Untitled', code, zoom });
      setRestored('none');
      // Both keys: a first save moves the sketch off the `new` slot, and leaving
      // that draft behind would hand it to the NEXT new sketch on the next load.
      clearDraft(null);
      clearDraft(id);
      void queryClient.invalidateQueries({ queryKey: ['blit', 'sketches'] });
      toast({ type: 'success', message: 'Sketch saved.' });
    },
    onError: (error: Error) => toast({ type: 'error', message: error.message || "Couldn't save the sketch." }),
  });

  // Identity-stable for the same reason `run` is: it goes into the editor's
  // keymap, and a fresh identity per render would reconfigure CodeMirror on every
  // keystroke. `useMutation` hands back a new object each render, so the current
  // one is reached through a ref.
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);
  const saveNow = useCallback(() => {
    // Ignored while one is already in flight, so holding the chord cannot queue
    // a second create and end up with two copies of the same sketch.
    if (!saveRef.current.isPending) saveRef.current.mutate();
  }, []);

  // Stepping pauses: a step that left the clock running would be overtaken before
  // it could be looked at, which is the whole point of stepping.
  const stepForward = useCallback(() => {
    setPlaying(false);
    clock.advance(1);
  }, [clock]);

  const stepBackOne = useCallback(() => {
    setPlaying(false);
    clock.set(stepBack(clock.get()));
  }, [clock]);

  const seek = useCallback(
    (frame: number) => {
      setPlaying(false);
      clock.set(frame);
    },
    [clock],
  );

  // Attached below the `save` mutation because the chord needs it.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.defaultPrevented) return;

      // Save comes BEFORE the typing guard, on purpose. Every other chord here
      // must stay out of a text field, but the moment someone most wants to save
      // is straight after typing a sketch name, so this one has to fire there
      // too. Inside the editor CodeMirror claims it first and marks it handled,
      // which the check above catches, so it never fires twice.
      if (isSaveChord(e)) {
        e.preventDefault(); // ...or the browser offers to save the page instead.
        saveNow();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }

      // Inside the editor CodeMirror owns this binding; `shouldIgnoreKey` is what
      // keeps the two from both firing.
      if (shouldIgnoreKey(e)) return;
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        run();
        return;
      }
      if (e.key === '?') {
        e.preventDefault();
        setDialog('shortcuts');
        return;
      }
      // A paint lands on the canvas, which takes no focus, so the editor never
      // sees this chord on its own and a painted pixel looked un-undoable. The
      // guard above means this only runs when focus is NOT in the editor, so
      // there is no second undo when it is.
      if (undoChord(e) && forwardToEditor(viewRef.current, e)) {
        e.preventDefault();
        return;
      }

      // Scene mode: the arrows nudge the picked sketch a pixel (eight with
      // Shift), and Escape lets go of it. Before the transport, whose `,` and
      // `.` are not arrows, so nothing is shadowed.
      if (canvasMode === 'scene' && selectedBlit !== null) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setSelectedBlit(null);
          return;
        }
        const nudge = ARROWS[e.key];
        const instance = sketch?.instances.get(selectedBlit);
        if (nudge && instance && movable.has(selectedBlit) && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault(); // ...or the page scrolls.
          const by = e.shiftKey ? 8 : 1;
          moveBlit(selectedBlit, instance.pos.x + nudge[0] * by, instance.pos.y + nudge[1] * by);
          return;
        }
      }

      // Transport. After the typing guard, so none of them fire mid-word, and
      // Space additionally checks what has focus: it is the activation key for a
      // button, so pressing it just after clicking Pause would otherwise toggle
      // playback twice and look like the shortcut had done nothing.
      if (isPlayPauseChord(e)) {
        if (wouldActivateFocused(e.target)) return;
        e.preventDefault(); // ...or the page scrolls.
        setPlaying((was) => !was);
        return;
      }
      if (isStepForwardChord(e)) {
        e.preventDefault();
        stepForward();
        return;
      }
      if (isStepBackChord(e)) {
        e.preventDefault();
        stepBackOne();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [run, saveNow, stepForward, stepBackOne, canvasMode, selectedBlit, sketch, movable, moveBlit]);

  const remove = useMutation({
    mutationFn: sketchesApi.remove,
    onSuccess: (_result, id) => {
      clearDraft(id);
      if (id === sketchId) {
        setSketchId(null);
        setSavedSnapshot(null);
      }
      void queryClient.invalidateQueries({ queryKey: ['blit', 'sketches'] });
    },
    onError: () => toast({ type: 'error', message: "Couldn't delete that sketch." }),
  });

  // ── Folders ───────────────────────────────────────────────────────────────
  //
  // Creating and renaming answer the explorer's inline field, which shows a
  // refusal under the name being typed, so those two throw rather than toast.
  // Moves are drawn at once and put back if the server says no.

  const refetchTree = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['blit', 'sketches'] }),
      queryClient.invalidateQueries({ queryKey: ['blit', 'folders'] }),
    ]);
  }, [queryClient]);

  const createFolder = useCallback(
    async (folderName: string, parentId: number | null) => {
      const folder = await foldersApi.create(folderName, parentId);
      await queryClient.invalidateQueries({ queryKey: ['blit', 'folders'] });
      return folder;
    },
    [queryClient],
  );

  const renameFolder = useCallback(
    async (folder: FolderRecord, next: string) => {
      await foldersApi.update(folder.id, { name: next });
      await queryClient.invalidateQueries({ queryKey: ['blit', 'folders'] });
    },
    [queryClient],
  );

  const moveFolder = useCallback(
    async (folder: FolderRecord, parentId: number | null) => {
      queryClient.setQueryData<FolderRecord[]>(['blit', 'folders'], (rows) =>
        rows?.map((row) => (row.id === folder.id ? { ...row, parent_id: parentId } : row)),
      );
      try {
        await foldersApi.update(folder.id, { parent_id: parentId });
      } catch (error) {
        toast({ type: 'error', message: error instanceof Error ? error.message : "Couldn't move that folder." });
      } finally {
        await queryClient.invalidateQueries({ queryKey: ['blit', 'folders'] });
      }
    },
    [queryClient],
  );

  const moveSketch = useCallback(
    async (target: SketchSummary, folderId: number | null) => {
      queryClient.setQueryData<SketchSummary[]>(['blit', 'sketches'], (rows) =>
        rows?.map((row) => (row.id === target.id ? { ...row, folder_id: folderId } : row)),
      );
      try {
        await sketchesApi.move(target.id, folderId);
      } catch (error) {
        toast({ type: 'error', message: error instanceof Error ? error.message : "Couldn't move that sketch." });
      } finally {
        await queryClient.invalidateQueries({ queryKey: ['blit', 'sketches'] });
      }
    },
    [queryClient],
  );

  /**
   * Rename from the tree. When it is the sketch in the buffer, the new name is
   * now what is saved, so the snapshot takes it — and so does the name field,
   * unless somebody has typed a different name there that they have not saved.
   */
  const renameSketch = useCallback(
    async (target: SketchSummary, next: string) => {
      const row = await sketchesApi.update(target.id, { name: next });
      if (target.id === sketchId) {
        const savedName = savedSnapshot?.name;
        setName((current) => (current === savedName ? row.name : current));
        setSavedSnapshot((saved) => (saved ? { ...saved, name: row.name } : saved));
      }
      await queryClient.invalidateQueries({ queryKey: ['blit', 'sketches'] });
    },
    [queryClient, sketchId, savedSnapshot],
  );

  const removeFolder = useMutation({
    mutationFn: (folder: FolderRecord) => foldersApi.remove(folder.id),
    onSuccess: (result, folder) => {
      const moved = result.moved_sketches + result.moved_folders;
      const where =
        result.parent_id === null ? 'at the top level' : `in “${folderList.data?.find((f) => f.id === result.parent_id)?.name ?? 'its parent'}”`;
      toast({
        type: 'success',
        message: moved ? `Deleted “${folder.name}”. What was in it is now ${where}.` : `Deleted “${folder.name}”.`,
      });
    },
    onError: () => toast({ type: 'error', message: "Couldn't delete that folder." }),
    onSettled: () => void refetchTree(),
  });

  // Keep the buffer on disk while it differs from its reference, and take it off
  // disk the moment it stops differing. Written this way round, a debounced write
  // that lands just after a save finds nothing to preserve and clears instead of
  // resurrecting a draft, so correctness does not depend on cancelling timers.
  useEffect(() => {
    if (!draftworthy) {
      clearDraft(sketchId);
      return;
    }
    const timer = setTimeout(() => {
      writeDraft(sketchId, { name, code, base: reference.code });
    }, DRAFT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draftworthy, sketchId, name, code, reference]);

  /** Put the reference text back and forget the draft. */
  const discardDraft = useCallback(() => {
    setName(reference.name);
    setCode(reference.code);
    setRestored('none');
    clearDraft(sketchId);
    const view = viewRef.current;
    if (view) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: reference.code } });
    }
    evaluate(reference.code);
  }, [evaluate, reference, sketchId]);

  const loadExample = useCallback(
    (example: Example) => {
      adopt(example.name, example.code, null, null);
      setDrawer(null);
    },
    [adopt],
  );

  // ── Export ────────────────────────────────────────────────────────────────

  const withExport = useCallback(async (job: () => Promise<void>) => {
    setExporting(true);
    try {
      await job();
    } catch (error) {
      toast({ type: 'error', message: error instanceof Error ? error.message : 'Export failed.' });
    } finally {
      setExporting(false);
    }
  }, []);

  // ── Import ────────────────────────────────────────────────────────────────

  /**
   * Put an imported sprite into the buffer.
   *
   * The README's line is that Blit is not a pixel editor, and importing is the
   * feature closest to crossing it. What keeps it on the right side is that the
   * result is code: a `sprite()` grid and its `.pal()`, which can then be edited,
   * parameterised and animated like anything else that was typed.
   *
   * An empty buffer gets a whole sketch, `size()` and all. A buffer with work in
   * it gets just the expression, at the cursor, so bringing in a reference never
   * costs what was already there. Either way it goes through the editor, so it is
   * one undo step.
   *
   * The sprite reaches here from one of two places — decoded in this tab, or
   * emitted by the import route for an image that had to be resized first — and
   * this function cannot tell which. That is the point of it: the two paths differ
   * only in where the pixels were read, and the source they produce is the same
   * pure function of them either way.
   */
  const place = useCallback(
    (sprite: ImportedSprite, stem: string) => {
      const blank = codeRef.current.trim() === '';
      const text = blank ? sketchSource(sprite) : spriteExpression(sprite);
      const view = viewRef.current;
      if (view) {
        const at = view.state.selection.main;
        view.dispatch({
          changes: blank
            ? { from: 0, to: view.state.doc.length, insert: text }
            : { from: at.from, to: at.to, insert: text },
          annotations: isolateHistory.of('before'),
        });
        const next = view.state.doc.toString();
        setCode(next);
        evaluate(next);
      } else {
        // No editor mounted yet (the small layout, mid-mount). Replacing is the
        // only thing that can be done without a cursor to insert at.
        setCode(text);
        evaluate(text);
      }

      // An empty buffer with nothing saved behind it is holding nothing, so the
      // name is not being kept either and the file is a better one than the
      // starter's. Anything saved, or any work still in the buffer, keeps its
      // name: that one may have been chosen.
      if (blank && sketchId === null) setName(stem);

      for (const warning of sprite.warnings) toast({ type: 'warning', message: warning });
      toast({
        type: 'success',
        message: `Imported ${sprite.width}x${sprite.height}, ${sprite.colors} colour${sprite.colors === 1 ? '' : 's'}.`,
      });
    },
    [evaluate, sketchId],
  );

  /**
   * Bring a PNG in as source, or ask what size it should be.
   *
   * The dimensions come off the PNG header, which is 24 bytes of a file that may
   * be four megabytes, and they decide everything: a file that already fits a grid
   * is decoded and emitted right here, with no server and no round trip. A bigger
   * one is not guessed at — the sizes it could be come back from the import route
   * with the colour count at each, and the choice goes to the person.
   */
  const importImage = useCallback(
    async (file: File) => {
      setExporting(true);
      try {
        if (!isPng(file)) {
          throw new Error(
            `${file.name} is not a PNG. Blit imports PNG, which is the one format that survives the trip exactly.`,
          );
        }
        const bytes = new Uint8Array(await file.arrayBuffer());
        const size = pngSize(bytes);
        if (!size) throw new Error(`Couldn't read ${file.name} as a PNG: its header does not say a size.`);
        if (Math.max(size.width, size.height) > IMPORT_MAX_SOURCE) {
          throw new Error(tooBigSourceReason(size.width, size.height));
        }

        if (Math.max(size.width, size.height) <= IMPORT_MAX_SIDE) {
          setPending(null);
          const decoded = await decodePngBytes(bytes, file.name);
          const outcome = importRgba(decoded.data, decoded.w, decoded.h);
          if (!outcome.ok) {
            toast({ type: 'error', message: outcome.reason });
            return;
          }
          place(outcome.sprite, decoded.stem);
          return;
        }

        const png = toBase64(bytes);
        const answer = await importApi.sizes(png);
        setPending({
          stem: fileStem(file.name),
          png,
          width: answer.source.width,
          height: answer.source.height,
          options: answer.options,
          refusal: null,
        });
      } catch (error) {
        toast({ type: 'error', message: error instanceof Error ? error.message : "Couldn't import that image." });
      } finally {
        setExporting(false);
      }
    },
    [place],
  );

  /**
   * Import the pending PNG at one of the sizes offered.
   *
   * A size the grid cannot take is not an error and does not close the bar: the
   * answer carries the measurement and the other sizes, so the refusal is shown
   * where the choice is and the next one is a click away.
   */
  const importAt = useCallback(
    async (size: number) => {
      if (!pending) return;
      setExporting(true);
      try {
        const answer = await importApi.at(pending.png, size);
        if (!answer.sprite) {
          setPending({ ...pending, options: answer.options, refusal: answer.refusal ?? null });
          return;
        }
        place(answer.sprite, pending.stem);
        setPending(null);
      } catch (error) {
        toast({ type: 'error', message: error instanceof Error ? error.message : "Couldn't import that image." });
      } finally {
        setExporting(false);
      }
    },
    [pending, place],
  );

  // Animations, sheets and Aseprite files start at frame 0: a loop that starts
  // wherever the playhead happened to be is not the loop the sketch describes.
  const exportHandlers = {
    onExportFrame: () => {
      if (sketch) void withExport(() => exportFrame(sketch.pattern, renderOptions(clock.get()), name, 1));
    },
    onExportSheet: () => {
      if (sketch) void withExport(() => exportSheet(sketch.pattern, renderOptions(0), name));
    },
    onExportAnimation: () => {
      if (sketch) void withExport(() => exportAnimation(sketch.pattern, renderOptions(0), name, zoom));
    },
    onExportAseprite: () => {
      if (sketch) void withExport(() => exportAseprite(sketch.pattern, renderOptions(0), name));
    },
    onExportSource: () => exportSource(code, name),
  };

  // ── Master bar ────────────────────────────────────────────────────────────

  const status = useQuery({
    queryKey: ['blit', 'status'],
    queryFn: async () => (await fetch('/api/blit/status')).ok,
    refetchInterval: 15000,
    retry: false,
  });
  const serverUp = status.isError ? false : (status.data ?? null);

  const newSketch = () => adopt('Untitled', newSketchCode(), null, null);
  const duplicate = () => adopt(`${name.trim() || 'Untitled'} copy`, code, null, null);
  const share = () => {
    if (sketchId === null) {
      toast({ type: 'warning', message: 'Save the sketch first, then it has a link.' });
      return;
    }
    const url = `${window.location.origin}${window.location.pathname}?sketch=${sketchId}`;
    void navigator.clipboard.writeText(url).then(
      () => toast({ type: 'success', message: 'Link copied.' }),
      () => toast({ type: 'error', message: `Couldn't copy. The link is ${url}` }),
    );
  };
  const setRamp = (rampName: string) => writeCode(withRamp(codeRef.current, rampName));
  const toggleSketches = () => (mode === 'small' ? setDrawer('sketches') : left.toggle());
  const toggleInspector = () => (mode === 'small' ? setDrawer('inspector') : right.toggle());
  const toggleMic = async () => {
    if (mic) {
      setMic(null);
      return;
    }
    try {
      setMic(await startMic());
      if (!playing) setPlaying(true);
    } catch {
      toast({ type: 'error', message: "Couldn't open the microphone." });
    }
  };

  const commands: Command[] = [
    { label: 'Run the sketch', hint: 'Ctrl+Enter', run },
    { label: 'Save', hint: 'Ctrl+S', run: saveNow },
    { label: playing ? 'Pause' : 'Play', hint: 'Space', run: () => setPlaying(!playing) },
    { label: 'New sketch', hint: 'File', run: newSketch },
    { label: 'Duplicate sketch', hint: 'File', run: duplicate },
    { label: 'Copy share link', hint: 'File', run: share },
    { label: 'Export frame as PNG', hint: 'Export', run: exportHandlers.onExportFrame },
    { label: 'Export sprite sheet', hint: 'Export', run: exportHandlers.onExportSheet },
    { label: 'Export animation (GIF)', hint: 'Export', run: exportHandlers.onExportAnimation },
    { label: 'Export Aseprite', hint: 'Export', run: exportHandlers.onExportAseprite },
    { label: 'Export source', hint: 'Export', run: exportHandlers.onExportSource },
    { label: 'Toggle sketches panel', hint: 'View', run: toggleSketches },
    { label: 'Toggle inspector panel', hint: 'View', run: toggleInspector },
    { label: 'Toggle pixel grid', hint: 'View', run: () => setShowGrid(!showGrid) },
    { label: 'Toggle onion skin', hint: 'View', run: () => setPrefs({ onion: !prefs.onion }) },
    { label: 'Toggle checkerboard', hint: 'View', run: () => setPrefs({ checker: !prefs.checker }) },
    ...ZOOMS.map((z) => ({ label: `Zoom ${z}x`, hint: 'View', run: () => setZoom(z) })),
    { label: prefs.live ? 'Turn live coding off' : 'Turn live coding on', hint: 'Live', run: () => setPrefs({ live: !prefs.live }) },
    { label: mic ? 'Stop microphone' : 'Start microphone', hint: 'Audio', run: () => void toggleMic() },
    ...Object.keys(RAMPS).map((r) => ({ label: `Palette: ${r}`, hint: 'Palettes', run: () => setRamp(r) })),
    { label: 'Theme: follow system', hint: 'Theme', run: () => setPrefs({ theme: 'system' }) },
    { label: 'Theme: light', hint: 'Theme', run: () => setPrefs({ theme: 'light' }) },
    { label: 'Theme: dark', hint: 'Theme', run: () => setPrefs({ theme: 'dark' }) },
    { label: 'Settings', run: () => setDialog('settings') },
    { label: 'Keyboard shortcuts', hint: '?', run: () => setDialog('shortcuts') },
    { label: 'Language reference', hint: 'Help', run: () => setDialog('docs') },
    { label: "What's new", hint: 'Help', run: () => setDialog('changelog') },
    ...(list.data ?? []).map((row) => ({ label: row.name, hint: 'Open sketch', run: () => open.mutate(row.id) })),
  ];

  const masterBar = (
    <MasterBar
      version={pkg.version}
      serverUp={serverUp}
      onNew={newSketch}
      onOpen={() => setPaletteOpen(true)}
      onDuplicate={duplicate}
      onImport={(file) => void importImage(file)}
      onShare={share}
      busy={exporting}
      {...exportHandlers}
      onToggleSketches={toggleSketches}
      onToggleInspector={toggleInspector}
      zoom={zoom}
      onZoom={setZoom}
      showGrid={showGrid}
      onShowGrid={setShowGrid}
      ramp={settings.ramp}
      onRamp={setRamp}
      mic={mic !== null}
      onMic={() => void toggleMic()}
      onPalette={() => setPaletteOpen(true)}
      onShortcuts={() => setDialog('shortcuts')}
      onDocs={() => setDialog('docs')}
      onChangelog={() => setDialog('changelog')}
      onSettings={() => setDialog('settings')}
    />
  );

  const appDialogs = (
    <>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
      <SettingsDialog open={dialog === 'settings'} onClose={() => setDialog(null)} />
      <ShortcutsDialog open={dialog === 'shortcuts'} onClose={() => setDialog(null)} />
      <TextDialog open={dialog === 'docs'} onClose={() => setDialog(null)} title="Language reference" text={languageDoc} />
      <TextDialog open={dialog === 'changelog'} onClose={() => setDialog(null)} title="What's new" text={changelog} />
    </>
  );

  // ── Panels ────────────────────────────────────────────────────────────────

  const sketchesPanel = (headerAction?: React.ReactNode) => (
    <SketchesPanel
      headerAction={headerAction}
      sketches={list.data ?? []}
      folders={folderList.data ?? []}
      loading={list.isPending || folderList.isPending}
      error={list.isError || folderList.isError}
      currentId={sketchId}
      dirty={unsaved && sketchId !== null}
      onOpen={(id) => {
        open.mutate(id);
        setDrawer(null);
      }}
      onDelete={setPendingDelete}
      onRename={renameSketch}
      onMove={moveSketch}
      onNew={(folderId) => {
        adopt('Untitled', newSketchCode(), null, null);
        setNewFolder(folderId);
        setDrawer(null);
      }}
      onCreateFolder={createFolder}
      onRenameFolder={renameFolder}
      onMoveFolder={moveFolder}
      onDeleteFolder={setPendingFolderDelete}
      onLoadExample={loadExample}
      onRetry={() => {
        void list.refetch();
        void folderList.refetch();
      }}
    />
  );

  const inspectorPanel = (headerAction?: React.ReactNode) => (
    <InspectorPanel
      headerAction={headerAction}
      settings={settings}
      chars={sketch?.chars ?? []}
      warnings={sketch?.warnings ?? []}
      paintChar={paintChar}
      onPaintChar={setPaintChar}
      zoom={zoom}
      onZoom={setZoom}
      showGrid={showGrid}
      onShowGrid={setShowGrid}
      layout={mode === 'small' ? undefined : workbench.layout}
      onLayout={mode === 'small' ? undefined : workbench.setLayout}
      busy={exporting}
      {...exportHandlers}
      onImportImage={(file) => void importImage(file)}
      scene={canvasMode === 'scene'}
      onScene={(on) => setCanvasMode(on ? 'scene' : 'paint')}
      placeable={placeable}
      onPlace={(id) => {
        const row = sketchRowsById.get(id);
        if (row) void placeSketch(row);
      }}
      placed={placedRows}
      selectedBlit={selectedBlit}
      onSelectBlit={selectBlit}
    />
  );

  const stage = useMemo(() => {
    if (sketch) {
      return (
        <BlitCanvas
          sketch={sketch}
          playing={playing}
          zoom={zoom}
          showGrid={showGrid}
          clock={clock}
          paintEnabled
          onPaint={paint}
          onRenderError={(message, site) => setFailure({ phase: 'render', message, site })}
          mode={canvasMode}
          selected={selectedBlit}
          onSelect={selectBlit}
          movable={movable}
          onMove={moveBlit}
          onion={prefs.onion}
          checker={prefs.checker}
          audio={mic ? mic.read : null}
        />
      );
    }

    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <AppsRegular className={chrome.art} aria-hidden />
        <div className="max-w-sm">
          <FluentBody>Nothing is running yet. Fix the sketch below, then run it.</FluentBody>
        </div>
        <FluentButton appearance="primary" onClick={run}>
          Run
        </FluentButton>
      </div>
    );
  }, [sketch, playing, zoom, showGrid, paint, run, clock, chrome.art, canvasMode, selectedBlit, selectBlit, movable, moveBlit, prefs.onion, prefs.checker, mic]);

  const center = (
    <div className={`${chrome.stage} flex min-w-0 flex-1 flex-col`}>
      <div className={`${chrome.card} flex min-h-0 flex-1 flex-col`}>
        <Toolbar
        name={name}
        onName={setName}
        dirty={dirty}
        unsaved={unsaved}
        playing={playing}
        onPlaying={setPlaying}
        onRun={run}
        onStep={stepForward}
        onStepBack={stepBackOne}
        onReset={() => clock.set(0)}
        clock={clock}
        cycle={settings.cycle}
        onSeek={seek}
          onSave={saveNow}
          saving={save.isPending}
          scene={canvasMode === 'scene'}
          onScene={(on) => setCanvasMode(on ? 'scene' : 'paint')}
        />

        {/* Above the error bar on purpose: it explains where the text on screen
            came from, which is context for any error the text then produces. */}
        {restored !== 'none' && (
          <div className={`${chrome.cardDivider} shrink-0 px-2 py-2`}>
            <FluentMessageBar
              intent={restored === 'diverged' ? 'warning' : 'info'}
              actions={
                <FluentButton size="small" onClick={discardDraft}>
                  Discard
                </FluentButton>
              }
            >
              {restored === 'diverged'
                ? 'Restored changes you had not saved. The saved sketch has changed since, so this is not on top of it.'
                : 'Restored changes you had not saved.'}
            </FluentMessageBar>
          </div>
        )}

        {/* The size chooser lives HERE, not in the Inspector's Import section,
            because a PNG dropped on the canvas has to reach it with the right
            panel collapsed or folded into the drawer. Same bar pattern as the
            draft notice above: a pending thing, with the choices next to it. */}
        {pending && (
          <div className={`${chrome.cardDivider} shrink-0 px-2 py-2`}>
            <FluentMessageBar
              intent={pending.refusal ? 'warning' : 'info'}
              actions={
                <>
                  {pending.options.map((option) => (
                    <FluentTag
                      key={option.size}
                      className="blit-tap"
                      onClick={() => void importAt(option.size)}
                      title={
                        option.exact
                          ? `${option.width}x${option.height}, ${option.colors} colours. Nothing is lost at this size: the image is this sprite scaled up.`
                          : `${option.width}x${option.height}, ${option.colors} colours`
                      }
                    >
                      {option.width}x{option.height}
                      {/* The dot is load-bearing, not decoration. Without it the
                          two numbers run together and `128x1284` cannot be read
                          as 128x128 and 4 colours — measured in a browser, where
                          a 5px margin turned out not to separate two digits. */}
                      <span style={{ marginInlineStart: 5, opacity: 0.7 }}>&middot; {option.colors}</span>
                    </FluentTag>
                  ))}
                  <FluentButton size="small" onClick={() => setPending(null)}>
                    Cancel
                  </FluentButton>
                </>
              }
            >
              {pending.refusal ?? chooserPrompt(pending)}
            </FluentMessageBar>
          </div>
        )}

        {failure && (
          <div className={`${chrome.cardDivider} shrink-0 px-2 py-2`}>
            <FluentMessageBar intent="error">
              <span className="font-mono text-xs">
                {failure.phase === 'compile'
                  ? "This sketch didn't parse"
                  : failure.phase === 'render'
                    ? 'This sketch failed while drawing'
                    : "This sketch didn't run"}
                {failure.site ? `, line ${failure.site.line}` : ''}: {failure.message}
              </span>
            </FluentMessageBar>
          </div>
        )}

        {/* Canvas and editor, with a handle between them. Which way they sit and
            how much each gets are remembered per arrangement; see lib/workbench. */}
        <div className={`flex min-h-0 min-w-0 flex-1 ${columns ? 'flex-row' : 'flex-col'}`}>
        {/* The drop target is the stage, not the whole card: dropping a PNG on
            the editor should still mean whatever the editor makes of it. */}
        <div
          className={`${columns ? chrome.cardDividerX : chrome.cardDivider} ${chrome.dropzone} flex min-h-0 min-w-0 flex-col${dropping ? ` ${chrome.dropping}` : ''}`}
          style={{ flex: `${workbench.share} 1 0%` }}
          onDragOver={(e) => {
            // A sketch row from the explorer places that sketch where it lands.
            const kind = carriesSketch(e.dataTransfer) ? 'sketch' : imageFromDrop(e.dataTransfer) ? 'image' : null;
            if (!kind) return;
            // Without preventDefault the browser navigates to the file instead.
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            setDropping(kind);
          }}
          onDragLeave={(e) => {
            // Only when the pointer has actually left, not on every child it
            // crosses on the way in.
            if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
            setDropping(null);
          }}
          onDrop={(e) => {
            const placed = sketchFromDrop(e.dataTransfer);
            const row = placed === null ? undefined : sketchRowsById.get(placed);
            if (row) {
              e.preventDefault();
              setDropping(null);
              void placeSketch(row, dropCell(e.currentTarget, e.clientX, e.clientY, settings));
              return;
            }
            const file = imageFromDrop(e.dataTransfer);
            if (!file) return;
            e.preventDefault();
            setDropping(null);
            void importImage(file);
          }}
        >
          {stage}
          {dropping && (
            <div className={chrome.dropHint} aria-hidden>
              {dropping === 'sketch' ? 'Drop to place it in this scene' : 'Drop to import as a sprite'}
            </div>
          )}
        </div>

        <SplitHandle
          axis={columns ? 'x' : 'y'}
          share={workbench.share}
          onShare={workbench.setShare}
          onReset={workbench.reset}
          label="the canvas and the editor"
        />

        {/* The editor keeps its CodeMirror theme: it is the one surface where a
            foreign palette would fight the syntax colours. What it takes from
            Fluent is the focus cue, a brand underline along the card's edge,
            because CodeMirror's own square outline is clipped by the corners. */}
        <div
          className={`${chrome.editorWell} blit-editor min-h-0 min-w-0 overflow-hidden`}
          style={{ flex: `${1 - workbench.share} 1 0%` }}
        >
          <CodePane
            value={code}
            onChange={setCode}
            onRun={run}
            onSave={saveNow}
            diagnostic={
              failure?.site ? { ...failure.site, message: failure.message } : null
            }
            onView={(view) => {
              viewRef.current = view;
            }}
          />
        </div>
        </div>
      </div>
    </div>
  );

  // ── Small: the rails fold into a drawer ───────────────────────────────────

  if (mode === 'small') {
    return (
      <FluentProvider theme={fluentTheme} className={chrome.fluentPin}>
        <div className={`blit-fluent ${chrome.canvas} relative flex h-full min-h-0 flex-col`}>
        {masterBar}
        {appDialogs}
        {center}

        {drawer === null && (
          <div className={`${chrome.card} absolute right-3 top-14 z-drawer flex gap-1 p-1`}>
            {/* Top-LEFT of a mobile viewport belongs to the host's own nav, and a
                second control there reads as the host menu (DESIGN 9). */}
            <FluentButton
              onClick={() => setDrawer('sketches')}
              aria-label="Show sketches"
              icon={<LayerRegular />}
            />
            <FluentButton
              onClick={() => setDrawer('inspector')}
              aria-label="Show inspector"
              icon={<OptionsRegular />}
            />
          </div>
        )}

        {/* Fluent's drawer: it comes in from the end over a dimmed page, rather
            than up from the bottom, which is the shape Fluent documents. The
            scrim is a sibling and closes it, so a tap anywhere outside is a way
            out even before Escape. */}
        {drawer !== null && (
          <>
            <div
              className={`${chrome.scrim} absolute inset-0 z-drawer`}
              onClick={() => setDrawer(null)}
              aria-hidden
            />
            <div
              className={`${chrome.drawer} absolute inset-y-0 right-0 z-drawer flex w-[320px] max-w-[85%] flex-col`}
              role="dialog"
              aria-modal="true"
              aria-label={drawer === 'sketches' ? 'Sketches' : 'Inspector'}
            >
              {/* The panel's own header is the drawer's header: a second title
                  row above it would name the same thing twice, and the panel's
                  commands (New) have to stay reachable in here either way. */}
              <div className="flex min-h-0 flex-1 flex-col pt-1">
                {(drawer === 'sketches' ? sketchesPanel : inspectorPanel)(
                  <FluentButton
                    size="small"
                    onClick={() => setDrawer(null)}
                    aria-label="Close"
                    tooltip="Close"
                    icon={<DismissRegular />}
                  />,
                )}
              </div>
            </div>
          </>
        )}

        <DeleteDialog
          target={pendingDelete}
          onCancel={() => setPendingDelete(null)}
          onConfirm={(target) => {
            remove.mutate(target.id);
            setPendingDelete(null);
          }}
        />
        <DeleteFolderDialog
          target={pendingFolderDelete}
          parentName={folderList.data?.find((f) => f.id === pendingFolderDelete?.parent_id)?.name ?? null}
          onCancel={() => setPendingFolderDelete(null)}
          onConfirm={(target) => {
            removeFolder.mutate(target);
            setPendingFolderDelete(null);
          }}
        />
        </div>
      </FluentProvider>
    );
  }

  return (
    <FluentProvider theme={fluentTheme} className={chrome.fluentPin}>
      <div className={`blit-fluent ${chrome.canvas} flex h-full min-h-0 flex-col`}>
      {masterBar}
      {appDialogs}
      <div className="flex min-h-0 flex-1">
      <SidePanel
        side="left"
        label="sketches"
        width={left.width}
        collapsed={left.collapsed}
        onWidth={left.setWidth}
        onToggle={left.toggle}
      >
        {(collapse) => sketchesPanel(collapse)}
      </SidePanel>

      {center}

      <SidePanel
        side="right"
        label="inspector"
        width={right.width}
        collapsed={right.collapsed}
        onWidth={right.setWidth}
        onToggle={right.toggle}
      >
        {(collapse) => inspectorPanel(collapse)}
      </SidePanel>
      </div>

      <DeleteDialog
        target={pendingDelete}
        onCancel={() => setPendingDelete(null)}
        onConfirm={(target) => {
          remove.mutate(target.id);
          setPendingDelete(null);
        }}
      />
      <DeleteFolderDialog
        target={pendingFolderDelete}
        parentName={folderList.data?.find((f) => f.id === pendingFolderDelete?.parent_id)?.name ?? null}
        onCancel={() => setPendingFolderDelete(null)}
        onConfirm={(target) => {
          removeFolder.mutate(target);
          setPendingFolderDelete(null);
        }}
      />
      </div>
    </FluentProvider>
  );
}

/**
 * The canvas pixel a drop landed on, from the canvas's live box. Undefined when
 * it missed the picture, and the sketch is then placed in the middle.
 */
function dropCell(
  stage: HTMLElement,
  clientX: number,
  clientY: number,
  settings: { w: number; h: number },
): { x: number; y: number } | undefined {
  const canvas = stage.querySelector('canvas');
  const rect = canvas?.getBoundingClientRect();
  if (!rect || rect.width === 0 || rect.height === 0) return undefined;
  const x = Math.floor((clientX - rect.left) / (rect.width / settings.w));
  const y = Math.floor((clientY - rect.top) / (rect.height / settings.h));
  if (x < 0 || y < 0 || x >= settings.w || y >= settings.h) return undefined;
  return { x, y };
}

/** Deleting goes through a Fluent Dialog, never `window.confirm` (DESIGN 8.11). */
function DeleteDialog({
  target,
  onCancel,
  onConfirm,
}: {
  target: SketchSummary | null;
  onCancel: () => void;
  onConfirm: (target: SketchSummary) => void;
}) {
  return (
    <Dialog
      open={target !== null}
      onOpenChange={(_e, data) => {
        // A backdrop click, Escape or the dismiss all report the dialog closing,
        // which is a cancel — the confirm path closes it itself.
        if (!data.open) onCancel();
      }}
    >
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Delete this sketch?</DialogTitle>
          <DialogContent>
            {target ? `"${target.name}" will be removed. This cannot be undone.` : ''}
          </DialogContent>
          <DialogActions>
            <FluentButton appearance="secondary" onClick={onCancel}>
              Cancel
            </FluentButton>
            <FluentButton
              appearance="primary"
              onClick={() => {
                if (target) onConfirm(target);
              }}
            >
              Delete sketch
            </FluentButton>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

/**
 * Deleting a folder asks first, even though nothing is lost: it undoes
 * somebody's filing, and the dialog is where they learn where things go.
 */
function DeleteFolderDialog({
  target,
  parentName,
  onCancel,
  onConfirm,
}: {
  target: FolderRecord | null;
  parentName: string | null;
  onCancel: () => void;
  onConfirm: (target: FolderRecord) => void;
}) {
  return (
    <Dialog
      open={target !== null}
      onOpenChange={(_e, data) => {
        if (!data.open) onCancel();
      }}
    >
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Delete this folder?</DialogTitle>
          <DialogContent>
            {target
              ? `"${target.name}" will be removed. Everything in it moves to ${parentName ? `"${parentName}"` : 'the top level'}; no sketch is deleted.`
              : ''}
          </DialogContent>
          <DialogActions>
            <FluentButton appearance="secondary" onClick={onCancel}>
              Cancel
            </FluentButton>
            <FluentButton
              appearance="primary"
              onClick={() => {
                if (target) onConfirm(target);
              }}
            >
              Delete folder
            </FluentButton>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
