/**
 * Blit's own surfaces, driven off the Fluent theme's tokens.
 *
 * The pieces that are not a single Fluent component — the tinted canvas the
 * panels sit on, the workbench card, the splitter edges, the phone drawer, the
 * editor's focus underline — are built here with Griffel `makeStyles` so their
 * colour and elevation come from `tokens.*` and follow Blit's violet theme and
 * the host's light/dark signal. Layout that carries no colour stays in
 * `styles.css`.
 */
import { makeStyles, tokens } from '@fluentui/react-components';

export const useChromeStyles = makeStyles({
  /**
   * The `<FluentProvider>` pins Blit's theme, but its default root is a
   * block-level `<div>` at `height: auto`. Sitting between the host's full-height
   * page and Blit's own `height: 100%` flex chain, that block box breaks the
   * chain: the layout collapses (a zero-height canvas that is present in the DOM
   * but invisible — "the sketch does not load") or overflows as a vertical stack.
   * `display: contents` makes the provider emit NO layout box while its theme
   * custom properties still cascade to the real layout root nested inside it.
   */
  fluentPin: {
    display: 'contents',
  },
  /** The tinted canvas the side panels and the workbench card sit on. */
  canvas: {
    background: tokens.colorNeutralBackground3,
  },
  /** The centre column leaves a small gap of canvas around its card. */
  stage: {
    padding: '8px',
  },
  /** The workbench card: raised off the canvas by elevation, corners clipped. */
  card: {
    position: 'relative',
    overflow: 'hidden',
    border: `1px solid ${tokens.colorTransparentStroke}`,
    borderRadius: tokens.borderRadiusLarge,
    background: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow4,
  },
  cardDivider: {
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  /** The same divider, turned, for the canvas beside the editor. */
  cardDividerX: {
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  /**
   * The editor keeps its CodeMirror theme; what it takes from Fluent is a brand
   * underline along the card's lower edge on focus, in place of CodeMirror's
   * square hairline, which the card's rounded corners would clip.
   */
  editorWell: {
    position: 'relative',
    '& .cm-editor.cm-focused': { outlineStyle: 'none' },
    '::after': {
      content: '""',
      position: 'absolute',
      insetInline: 0,
      bottom: 0,
      height: '2px',
      background: tokens.colorCompoundBrandStroke,
      pointerEvents: 'none',
      transform: 'scaleX(0)',
      transitionProperty: 'transform',
      transitionDuration: tokens.durationFaster,
      transitionTimingFunction: tokens.curveAccelerateMax,
    },
    '&:focus-within::after': {
      transform: 'scaleX(1)',
      transitionDuration: tokens.durationNormal,
      transitionTimingFunction: tokens.curveDecelerateMid,
    },
  },
  /** A decorative empty-state glyph, well beyond icon scale on purpose. */
  art: {
    width: '32px',
    height: '32px',
    color: tokens.colorNeutralForeground4,
  },
  // ── The drop target ─────────────────────────────────────────────────────
  dropzone: {
    position: 'relative',
  },
  dropping: {
    '::after': {
      content: '""',
      position: 'absolute',
      inset: '4px',
      borderRadius: tokens.borderRadiusMedium,
      outline: `2px dashed ${tokens.colorCompoundBrandStroke}`,
      outlineOffset: '-2px',
      background: tokens.colorBackgroundOverlay,
      pointerEvents: 'none',
    },
  },
  dropHint: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    zIndex: 1,
    padding: '6px 12px',
    borderRadius: tokens.borderRadiusMedium,
    background: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
    pointerEvents: 'none',
  },
  // ── The phone drawer ─────────────────────────────────────────────────────
  scrim: {
    background: tokens.colorBackgroundOverlay,
    animationName: { from: { opacity: 0 }, to: { opacity: 1 } },
    animationDuration: tokens.durationGentle,
    animationTimingFunction: tokens.curveDecelerateMid,
  },
  drawer: {
    background: tokens.colorNeutralBackground3,
    boxShadow: tokens.shadow64,
    animationName: { from: { transform: 'translateX(100%)' }, to: { transform: 'translateX(0)' } },
    animationDuration: tokens.durationGentle,
    animationTimingFunction: tokens.curveDecelerateMid,
  },
  // ── The collapsed rail and the resize edges ──────────────────────────────
  rail: {
    display: 'flex',
    width: '48px',
    flex: 'none',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    paddingTop: '15px',
  },
  /** The side-panel resize edge: invisible until hovered, focused or dragged. */
  splitter: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '8px',
    outlineStyle: 'none',
    background: 'transparent',
    cursor: 'col-resize',
    touchAction: 'none',
    '&[data-side="left"]': { right: '-8px' },
    '&[data-side="right"]': { left: '-8px' },
    '::after': {
      content: '""',
      position: 'absolute',
      top: '8px',
      bottom: '8px',
      left: '3px',
      width: '2px',
      borderRadius: tokens.borderRadiusSmall,
      background: 'transparent',
      transitionProperty: 'background-color',
      transitionDuration: tokens.durationFaster,
    },
    '&:hover::after': { background: tokens.colorCompoundBrandStroke },
    '&:focus-visible::after': { background: tokens.colorCompoundBrandStroke },
    '&[data-dragging]::after': { background: tokens.colorCompoundBrandStroke },
  },
  /** The handle between the canvas and the editor, a flex item in the card. */
  split: {
    position: 'relative',
    flex: '0 0 8px',
    outlineStyle: 'none',
    background: 'transparent',
    touchAction: 'none',
    '&[data-axis="x"]': { cursor: 'col-resize' },
    '&[data-axis="y"]': { cursor: 'row-resize' },
    '::after': {
      content: '""',
      position: 'absolute',
      borderRadius: tokens.borderRadiusSmall,
      background: 'transparent',
      transitionProperty: 'background-color',
      transitionDuration: tokens.durationFaster,
    },
    '&[data-axis="x"]::after': { top: '8px', bottom: '8px', left: '3px', width: '2px' },
    '&[data-axis="y"]::after': { left: '8px', right: '8px', top: '3px', height: '2px' },
    '&:hover::after': { background: tokens.colorCompoundBrandStroke },
    '&:focus-visible::after': { background: tokens.colorCompoundBrandStroke },
    '&[data-dragging]::after': { background: tokens.colorCompoundBrandStroke },
    '@media (pointer: coarse)': {
      flexBasis: '16px',
      '&[data-axis="x"]::after': { left: '7px' },
      '&[data-axis="y"]::after': { top: '7px' },
    },
  },
});
