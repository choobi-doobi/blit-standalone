/**
 * The editor.
 *
 * Ctrl/Cmd + Enter always runs. With Live on (the master bar), the page also
 * re-runs a moment after typing stops; a failed run leaves the last good
 * picture playing, so a half-typed chain never blanks the canvas.
 *
 * The keymap is at highest precedence so `Mod-Enter` beats CodeMirror's own
 * newline binding.
 *
 * Save is bound HERE as well as on the page, because a window-level handler is
 * suppressed while the editor has focus (that guard is what stops every other
 * shortcut firing mid-word). It goes through a raw `keydown` handler rather than
 * a `Mod-s` keymap entry, and that is not a style choice: CodeMirror matches a
 * binding against the UNSHIFTED name of the key too, so `Mod-s` also fires on
 * `Ctrl`/`Cmd` + `Shift` + `S` and the editor would quietly swallow Save As.
 * Reading the event with the page's own `isSaveChord` means the two surfaces
 * cannot drift apart about what the chord is.
 *
 * `onView` hands the EditorView up to the page, which needs it to forward the
 * undo chord in from outside: a paint happens on the canvas, which takes no
 * focus, so CodeMirror never sees the keystroke on its own.
 *
 * A failure's position arrives as `diagnostic` and is applied through
 * `@codemirror/lint`, so the marker lands in a gutter the editor already manages
 * and the underline survives scrolling and editing. The line and column are
 * converted to document offsets HERE rather than by the caller, because only the
 * editor knows how long each line is and a position past the end of one has to be
 * clamped rather than dropped.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { lintGutter, setDiagnostics, type Diagnostic } from '@codemirror/lint';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView, keymap } from '@codemirror/view';
import { EditorState, Prec, type Extension } from '@codemirror/state';
import { indentUnit } from '@codemirror/language';

import { isSaveChord } from '../lib/chords';
import { useIsLightTheme } from '../hooks/useIsMobile';
import { usePrefs } from '../lib/prefs';

export interface CodePaneProps {
  value: string;
  onChange: (value: string) => void;
  onRun: () => void;
  onSave: () => void;
  onView?: (view: EditorView) => void;
  /** Where the last failure was, if it could be located. */
  diagnostic?: { line: number; column: number; message: string } | null;
}

/**
 * One diagnostic, clamped into the document as it stands now.
 *
 * The buffer can have changed since the sketch was run — that is the normal
 * live-coding state — so a position from an older evaluation may point past the
 * end of a line or past the last line. Clamping keeps the marker near the truth
 * instead of throwing it away.
 */
function diagnosticsFor(
  state: EditorState,
  at: { line: number; column: number; message: string } | null | undefined,
): Diagnostic[] {
  if (!at) return [];
  const line = state.doc.line(Math.min(Math.max(1, at.line), state.doc.lines));
  const from = Math.min(line.from + Math.max(0, at.column - 1), line.to);
  return [{ from, to: line.to, severity: 'error', message: at.message }];
}

export default function CodePane({ value, onChange, onRun, onSave, onView, diagnostic }: CodePaneProps) {
  const light = useIsLightTheme();
  const { fontSize, tabSize, lineWrap } = usePrefs();
  const viewRef = useRef<EditorView | null>(null);

  const takeView = useCallback(
    (view: EditorView) => {
      viewRef.current = view;
      onView?.(view);
    },
    [onView],
  );

  // Keyed on the position's parts, not the object: the page rebuilds that object
  // every render and dispatching a transaction each time would fight typing.
  const line = diagnostic?.line;
  const column = diagnostic?.column;
  const message = diagnostic?.message;
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const at = line === undefined || column === undefined ? null : { line, column, message: message ?? '' };
    view.dispatch(setDiagnostics(view.state, diagnosticsFor(view.state, at)));
  }, [line, column, message]);

  const extensions = useMemo<Extension[]>(
    () => [
      javascript(),
      lintGutter(),
      ...(lineWrap ? [EditorView.lineWrapping] : []),
      EditorState.tabSize.of(tabSize),
      indentUnit.of(' '.repeat(tabSize)),
      Prec.highest(
        keymap.of([
          {
            key: 'Mod-Enter',
            preventDefault: true,
            run: () => {
              onRun();
              return true;
            },
          },
        ]),
      ),
      Prec.highest(
        EditorView.domEventHandlers({
          keydown: (event) => {
            if (!isSaveChord(event)) return false;
            event.preventDefault(); // ...or the browser offers to save the page.
            onSave();
            return true;
          },
        }),
      ),
    ],
    [onRun, onSave, lineWrap, tabSize],
  );

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      theme={light ? 'light' : oneDark}
      height="100%"
      style={{ height: '100%', fontSize }}
      extensions={extensions}
      onCreateEditor={takeView}
      basicSetup={{
        lineNumbers: true,
        foldGutter: false,
        highlightActiveLine: true,
        autocompletion: true,
        bracketMatching: true,
        closeBrackets: true,
      }}
    />
  );
}
