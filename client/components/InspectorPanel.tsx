/**
 * Secondary panel: what is selected and what can be changed about it.
 *
 * The palette section doubles as the brush. It is built from what the renderer
 * MEASURED, not from reading the source, so a `.pal()` buried in a chain shows
 * up here correctly and an unmapped character is reported because it was really
 * asked for and really missing.
 *
 * Canvas size, frame rate and cycle length are read-only on purpose: they are
 * set by the sketch (`size()`, `fps()`, `cycle()`), and a control that silently
 * disagreed with the code would give the same fact two homes.
 *
 * The palette chips are the one Fluent surface whose fill is DATA rather than a
 * token, so their selected state takes a ring that survives an arbitrary colour
 * underneath it. See the `swatch` style below.
 */

import { useRef, useState, type ReactNode } from 'react';

import {
  ArrowDownloadRegular,
  CodeRegular,
  ImageAddRegular,
  ImageRegular,
  LayerRegular,
  VideoClipRegular,
} from '@fluentui/react-icons';
import { Combobox, Option, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';

import { FluentButton } from './fluent';
import {
  FluentCaption,
  FluentFieldLabel,
  FluentMessageBar,
  FluentMessageLine,
  FluentPanel,
  FluentPanelHeader,
  FluentPanelPad,
  FluentPanelScroll,
  FluentSectionTitle,
  FluentSwitch,
  FluentTag,
  FluentTagGroup,
  FluentValue,
} from './fluentPanels';
import { IMPORT_MAX_SIDE, IMPORT_MAX_SOURCE } from '../lib/blit/importImage';
import { IMPORT_ACCEPT } from '../lib/decodeImage';
import { toCss } from '../lib/blit/color';
import type { CharUse, SketchSettings } from '../lib/blit/evaluate';
import { ZOOMS } from '../lib/zoom';
import type { WorkbenchLayout } from '../lib/workbench';

export interface InspectorPanelProps {
  settings: SketchSettings;
  chars: CharUse[];
  warnings: string[];
  paintChar: string;
  onPaintChar: (ch: string) => void;
  zoom: number;
  onZoom: (zoom: number) => void;
  showGrid: boolean;
  onShowGrid: (show: boolean) => void;
  /**
   * How the canvas and the editor are arranged. Absent on the narrow layout,
   * where there is only one arrangement that fits and so no choice to offer.
   */
  layout?: WorkbenchLayout;
  onLayout?: (layout: WorkbenchLayout) => void;
  onExportFrame: () => void;
  onExportSheet: () => void;
  onExportAnimation: () => void;
  onExportAseprite: () => void;
  onExportSource: () => void;
  /** A picked image file, to be brought in as sprite source. */
  onImportImage: (file: File) => void;
  busy: boolean;
  /** The frame's own control (collapse, or close in the drawer). */
  headerAction?: ReactNode;
  /** Whether the canvas is in scene mode. */
  scene: boolean;
  onScene: (scene: boolean) => void;
  /** Saved sketches this one may place: every one but itself. */
  placeable: ReadonlyArray<{ id: number; name: string }>;
  onPlace: (id: number) => void;
  /** The sketches this one has placed, in source order. */
  placed: ReadonlyArray<PlacedRow>;
  selectedBlit: number | null;
  onSelectBlit: (id: number | null) => void;
}

/** One placed sketch, as the Scene section lists it. */
export interface PlacedRow {
  id: number;
  name: string;
  x: number;
  y: number;
  /** A drag can move it: plain-number position, one call. */
  movable: boolean;
  /** Its source is still on its way. */
  loading: boolean;
}

/**
 * The two arrangements of the workbench card. Named for what you get rather than
 * for the axis being split: "vertical" means the pane divider to one person and
 * the stack to the next, and this control has to be read at a glance.
 */
const LAYOUT_CHOICES: { value: WorkbenchLayout; label: string; hint: string }[] = [
  { value: 'stacked', label: 'Stacked', hint: 'The canvas above the editor' },
  { value: 'columns', label: 'Side by side', hint: 'The canvas beside the editor, in two columns' },
];

/** What a click on the canvas does. */
const MODE_CHOICES: { value: boolean; label: string; hint: string }[] = [
  { value: false, label: 'Paint', hint: 'A click paints the brush into the sprite under it' },
  { value: true, label: 'Scene', hint: 'A click picks up a placed sketch, and a drag moves it' },
];

const useStyles = makeStyles({
  /** A palette chip carries the SKETCH's own colour, so it is a 32px square. */
  swatch: {
    minWidth: '32px',
    width: '32px',
    height: '32px',
    padding: 0,
    fontFamily: tokens.fontFamilyMonospace,
    // The chosen chip takes a brand ring plus the high-contrast focus stroke,
    // so the selection reads over an arbitrary palette colour underneath.
    '&[aria-pressed="true"]': {
      boxShadow: `inset 0 0 0 2px ${tokens.colorCompoundBrandStroke}, inset 0 0 0 3px ${tokens.colorStrokeFocus2}`,
    },
  },
  /** Export and import commands are full-width, labelled, left-aligned. */
  fullStart: {
    width: '100%',
    justifyContent: 'flex-start',
  },
  actions: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
});

export default function InspectorPanel({
  settings,
  chars,
  warnings,
  paintChar,
  onPaintChar,
  zoom,
  onZoom,
  showGrid,
  onShowGrid,
  layout,
  onLayout,
  onExportFrame,
  onExportSheet,
  onExportAnimation,
  onExportAseprite,
  onExportSource,
  onImportImage,
  busy,
  headerAction,
  scene,
  onScene,
  placeable,
  onPlace,
  placed,
  selectedBlit,
  onSelectBlit,
}: InspectorPanelProps) {
  const styles = useStyles();
  const picker = useRef<HTMLInputElement | null>(null);
  const swatches: CharUse[] = [{ ch: '.', color: 0 }, ...chars.filter((c) => c.ch !== '.')];
  /** What is typed into the place box, which filters it. Cleared on each place. */
  const [query, setQuery] = useState('');
  const matching = placeable.filter((row) => row.name.toLowerCase().includes(query.trim().toLowerCase()));

  const sceneSection = (
    <>
      <FluentSectionTitle count={placed.length || undefined}>Scene</FluentSectionTitle>
      <FluentPanelPad>
        <FluentTagGroup>
          {MODE_CHOICES.map(({ value, label, hint }) => (
            <FluentTag
              key={label}
              className="blit-tap"
              selected={value === scene}
              onClick={() => onScene(value)}
              title={hint}
            >
              {label}
            </FluentTag>
          ))}
        </FluentTagGroup>
        <div className="mt-3">
          <FluentFieldLabel>Place a sketch</FluentFieldLabel>
          <div className="mt-1">
            <Combobox
              aria-label="Place a saved sketch in this one"
              placeholder={placeable.length ? 'Pick a saved sketch' : 'No other saved sketches'}
              disabled={placeable.length === 0}
              freeform
              value={query}
              selectedOptions={[]}
              onChange={(e) => setQuery(e.target.value)}
              onOptionSelect={(_e, data) => {
                const id = Number(data.optionValue);
                setQuery('');
                if (Number.isInteger(id)) onPlace(id);
              }}
              className={styles.fullStart}
            >
              {matching.map((row) => (
                <Option key={row.id} value={String(row.id)} text={row.name}>
                  {row.name}
                </Option>
              ))}
            </Combobox>
          </div>
        </div>
        <div className="mt-2">
          <FluentCaption>
            Or drag one from the sketch list onto the canvas. In scene mode, drag a placed sketch to move it;
            the arrow keys nudge it, Shift for 8.
          </FluentCaption>
        </div>
        {placed.length > 0 && (
          <div className="mt-2 flex flex-col gap-1">
            {placed.map((row) => (
              <FluentButton
                key={row.id}
                size="small"
                className={styles.fullStart}
                appearance={row.id === selectedBlit ? 'secondary' : 'subtle'}
                aria-pressed={row.id === selectedBlit}
                onClick={() => {
                  onScene(true);
                  onSelectBlit(row.id);
                }}
                tooltip={
                  row.loading
                    ? 'Still loading'
                    : row.movable
                      ? `At ${row.x}, ${row.y}`
                      : `At ${row.x}, ${row.y}. Placed by an expression, so it moves in the code.`
                }
              >
                <span className="truncate">{row.name}</span>
                <span className="ml-auto pl-2 font-mono text-xs opacity-70">
                  {row.loading ? '…' : `${row.x}, ${row.y}`}
                </span>
              </FluentButton>
            ))}
          </div>
        )}
      </FluentPanelPad>
    </>
  );

  return (
    <FluentPanel label="Inspector">
      <FluentPanelHeader title="Inspector">{headerAction}</FluentPanelHeader>

      <FluentPanelScroll>
        {/* First while it is what a click does; after the brush otherwise. */}
        {scene && sceneSection}

        <FluentSectionTitle>Brush</FluentSectionTitle>
        <FluentPanelPad>
          <FluentCaption>Alt or right click erases.</FluentCaption>
          <div className="mt-2">
            <FluentTagGroup>
              {swatches.map(({ ch, color }) => {
                const transparent = color === null || (color & 0xff) === 0;
                return (
                  <FluentTag
                    key={ch}
                    className={mergeClasses(styles.swatch, 'blit-tap', transparent && 'blit-transparency')}
                    selected={ch === paintChar}
                    onClick={() => onPaintChar(ch)}
                    aria-label={`Paint with '${ch}'`}
                    title={
                      color === null
                        ? `'${ch}' has no color`
                        : transparent
                          ? `'${ch}' is transparent`
                          : `'${ch}' is ${toCss(color)}`
                    }
                    style={transparent ? undefined : { backgroundColor: toCss(color) }}
                  >
                    {/* The glyph sits on the SKETCH's colour, not on a theme
                        surface, so its scrim is fixed rather than tokenised:
                        there is no token that stays readable over an arbitrary
                        palette entry. */}
                    <span className={`rounded px-0.5 ${transparent ? '' : 'bg-black/45 text-white'}`}>
                      {ch === '.' ? '·' : ch}
                    </span>
                  </FluentTag>
                );
              })}
            </FluentTagGroup>
          </div>
          {chars.length === 0 && (
            <div className="mt-2">
              <FluentCaption>This sketch draws no characters, so there is nothing to paint into.</FluentCaption>
            </div>
          )}
        </FluentPanelPad>

        {warnings.length > 0 && (
          <FluentPanelPad>
            <FluentMessageBar intent="warning">
              {warnings.map((warning) => (
                <FluentMessageLine key={warning}>{warning}</FluentMessageLine>
              ))}
            </FluentMessageBar>
          </FluentPanelPad>
        )}

        {!scene && sceneSection}

        <FluentSectionTitle>View</FluentSectionTitle>
        <FluentPanelPad>
          <FluentTagGroup>
            {ZOOMS.map((z) => (
              <FluentTag
                key={z}
                className="blit-tap"
                selected={z === zoom}
                onClick={() => onZoom(z)}
                aria-label={`Zoom ${z}x`}
              >
                {z}x
              </FluentTag>
            ))}
          </FluentTagGroup>
          <div className="mt-3 flex items-center justify-between gap-2">
            <FluentFieldLabel>Pixel grid</FluentFieldLabel>
            <FluentSwitch checked={showGrid} onChange={onShowGrid} label="Pixel grid" />
          </div>
          {layout !== undefined && onLayout !== undefined && (
            <div className="mt-3">
              <FluentFieldLabel>Layout</FluentFieldLabel>
              <div className="mt-1">
                <FluentTagGroup>
                  {LAYOUT_CHOICES.map(({ value, label, hint }) => (
                    <FluentTag
                      key={value}
                      className="blit-tap"
                      selected={value === layout}
                      onClick={() => onLayout(value)}
                      title={hint}
                    >
                      {label}
                    </FluentTag>
                  ))}
                </FluentTagGroup>
              </div>
            </div>
          )}
        </FluentPanelPad>

        <FluentSectionTitle>Sketch</FluentSectionTitle>
        <FluentPanelPad>
          <dl className="m-0 flex flex-col gap-1">
            {[
              ['Size', `${settings.w} x ${settings.h}`, 'size()'],
              ['Rate', `${settings.fps} fps`, 'fps()'],
              ['Cycle', `${settings.cycle} frames`, 'cycle()'],
              ['Ramp', settings.ramp, 'ramp()'],
            ].map(([label, value, source]) => (
              <div key={label} className="flex items-baseline justify-between gap-2">
                <dt>
                  <FluentFieldLabel>{label}</FluentFieldLabel>
                </dt>
                <dd className="m-0">
                  <FluentValue title={`Set with ${source} in the sketch`}>{value}</FluentValue>
                </dd>
              </div>
            ))}
          </dl>
        </FluentPanelPad>

        <FluentSectionTitle>Export</FluentSectionTitle>
        <FluentPanelPad className={styles.actions}>
          <FluentButton
            className={styles.fullStart}
            busy={busy}
            onClick={onExportFrame}
            icon={<ImageRegular />}
          >
            Frame PNG
          </FluentButton>
          <FluentButton
            className={styles.fullStart}
            busy={busy}
            onClick={onExportSheet}
            icon={<ArrowDownloadRegular />}
          >
            Spritesheet
          </FluentButton>
          {/* The loop, as one file that plays. A spritesheet is the right thing
              to hand an engine and the wrong thing to show a person. */}
          <FluentButton
            className={styles.fullStart}
            busy={busy}
            onClick={onExportAnimation}
            icon={<VideoClipRegular />}
            tooltip="One cycle as an animated GIF"
          >
            Loop
          </FluentButton>
          {/* The third audience: not an engine and not a viewer, but somebody
              who wants to keep drawing. Frames and timing survive the trip. */}
          <FluentButton
            className={styles.fullStart}
            busy={busy}
            onClick={onExportAseprite}
            icon={<LayerRegular />}
            tooltip="The cycle as an Aseprite sprite, at natural size"
          >
            Aseprite
          </FluentButton>
          <FluentButton className={styles.fullStart} onClick={onExportSource} icon={<CodeRegular />}>
            Source
          </FluentButton>
        </FluentPanelPad>

        <FluentSectionTitle>Import</FluentSectionTitle>
        <FluentPanelPad className={styles.actions}>
          {/* Import produces SOURCE, not a layer: a `sprite()` grid and its
              `.pal()`, which is then ordinary code. Dropping a file on the canvas
              does the same thing; this is the keyboard-reachable way to it. */}
          <FluentButton
            className={styles.fullStart}
            busy={busy}
            onClick={() => picker.current?.click()}
            icon={<ImageAddRegular />}
            tooltip="Read a PNG into a sprite literal, at the cursor"
          >
            Image as sprite
          </FluentButton>
          <FluentCaption>
            Or drop one on the canvas. PNG, up to {IMPORT_MAX_SOURCE}x{IMPORT_MAX_SOURCE}. Over{' '}
            {IMPORT_MAX_SIDE} you pick the size it comes in at.
          </FluentCaption>
          <input
            ref={picker}
            type="file"
            accept={IMPORT_ACCEPT}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              // Cleared so picking the same file twice in a row still fires.
              e.target.value = '';
              if (file) onImportImage(file);
            }}
          />
        </FluentPanelPad>
      </FluentPanelScroll>
    </FluentPanel>
  );
}
