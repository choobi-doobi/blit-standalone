/**
 * Blit's side-panel primitives, on the real Fluent 2 design system.
 *
 * Companion to `fluent.tsx`; the same boundary applies (`lib/blitIdentity.test`).
 * Every async view needs a designed empty, loading and error state, so the
 * skeleton rows and the message bar live here rather than improvised per panel.
 * Colour, elevation and type all come from the Fluent theme's `tokens.*` through
 * Griffel `makeStyles`, so the panels follow Blit's violet theme and the host's
 * light/dark signal without a hand-authored value anywhere.
 */

import type { CSSProperties, ReactNode } from 'react';
import {
  Body1,
  Caption1,
  MessageBar,
  MessageBarActions,
  MessageBarBody,
  Skeleton,
  SkeletonItem,
  Switch,
  ToggleButton,
  Tooltip,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';

const useStyles = makeStyles({
  panel: {
    display: 'flex',
    height: '100%',
    minHeight: 0,
    flexDirection: 'column',
    color: tokens.colorNeutralForeground1,
  },
  header: {
    display: 'flex',
    flex: 'none',
    alignItems: 'center',
    columnGap: '4px',
    minHeight: '40px',
    padding: '6px 8px 2px 12px',
  },
  title: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    margin: 0,
    fontSize: tokens.fontSizeBase400,
    fontWeight: tokens.fontWeightSemibold,
    lineHeight: tokens.lineHeightBase400,
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: tokens.colorNeutralForeground1,
  },
  scroll: {
    minHeight: 0,
    flex: 1,
    overflowY: 'auto',
    scrollbarWidth: 'thin',
  },
  pad: {
    padding: '0 12px 8px',
  },
  sectionTitle: {
    margin: 0,
    padding: '14px 12px 4px',
    color: tokens.colorNeutralForeground1,
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold,
    lineHeight: tokens.lineHeightBase300,
  },
  sectionTitleCount: {
    display: 'flex',
  },
  count: {
    marginInlineStart: 'auto',
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    fontVariantNumeric: 'tabular-nums',
    lineHeight: tokens.lineHeightBase200,
  },
  label: {
    color: tokens.colorNeutralForeground1,
    fontSize: tokens.fontSizeBase300,
    lineHeight: tokens.lineHeightBase300,
  },
  value: {
    color: tokens.colorNeutralForeground1,
    fontSize: tokens.fontSizeBase300,
    fontVariantNumeric: 'tabular-nums',
    lineHeight: tokens.lineHeightBase300,
  },
  caption: {
    margin: 0,
    color: tokens.colorNeutralForeground3,
  },
  body: {
    margin: 0,
    color: tokens.colorNeutralForeground2,
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '8px',
    padding: '4px 12px 12px',
  },
  truncate: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  // ── Nav list ──────────────────────────────────────────────────────────────
  navList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
    margin: 0,
    padding: '0 4px 8px',
    listStyle: 'none',
  },
  navItem: {
    position: 'relative',
    '&:hover [data-bf-actions]': { opacity: 1 },
    '&:focus-within [data-bf-actions]': { opacity: 1 },
    '@media (pointer: coarse)': {
      '& [data-bf-actions]': { opacity: 1 },
    },
  },
  navRow: {
    position: 'relative',
    display: 'flex',
    width: '100%',
    minHeight: '32px',
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '4px 32px 4px 8px',
    border: 0,
    borderRadius: tokens.borderRadiusMedium,
    background: 'transparent',
    color: tokens.colorNeutralForeground2,
    textAlign: 'start',
    cursor: 'pointer',
    ':hover': {
      background: tokens.colorSubtleBackgroundHover,
      color: tokens.colorNeutralForeground2Hover,
    },
    ':active': {
      background: tokens.colorSubtleBackgroundPressed,
    },
    ':focus-visible': {
      outlineStyle: 'none',
      boxShadow: `inset 0 0 0 2px ${tokens.colorStrokeFocus2}`,
    },
  },
  navRowPlain: {
    paddingRight: '8px',
  },
  navRowSelected: {
    background: tokens.colorSubtleBackgroundSelected,
    color: tokens.colorNeutralForeground1,
    '::before': {
      content: '""',
      position: 'absolute',
      top: '50%',
      left: 0,
      width: '4px',
      height: '20px',
      marginTop: '-10px',
      borderRadius: tokens.borderRadiusSmall,
      background: tokens.colorCompoundBrandForeground1,
    },
  },
  navTitle: {
    display: 'flex',
    maxWidth: '100%',
    alignItems: 'center',
    gap: '6px',
    fontSize: tokens.fontSizeBase300,
    lineHeight: tokens.lineHeightBase300,
  },
  navTitleSelected: {
    fontWeight: tokens.fontWeightSemibold,
  },
  navMeta: {
    maxWidth: '100%',
    overflow: 'hidden',
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  navActions: {
    position: 'absolute',
    top: '50%',
    right: '6px',
    display: 'flex',
    opacity: 0,
    transform: 'translateY(-50%)',
  },
  // ── Tags ──────────────────────────────────────────────────────────────────
  tagGroup: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
  },
  tag: {
    minWidth: 'unset',
    // The chosen chip takes the violet compound-brand stroke, which reads over
    // both a theme surface and (for a swatch) an arbitrary sketch colour. Set
    // per side: Griffel reserves the `borderColor` shorthand for its helper.
    '&[aria-pressed="true"]': {
      borderTopColor: tokens.colorCompoundBrandStroke,
      borderRightColor: tokens.colorCompoundBrandStroke,
      borderBottomColor: tokens.colorCompoundBrandStroke,
      borderLeftColor: tokens.colorCompoundBrandStroke,
      color: tokens.colorNeutralForeground1,
    },
  },
  // ── Skeleton ──────────────────────────────────────────────────────────────
  skeletonRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '10px 12px',
  },
  srOnly: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
  },
  // ── Message bar ───────────────────────────────────────────────────────────
  messageBlock: {
    display: 'block',
  },
});

export function FluentPanel({ children, label }: { children: ReactNode; label: string }) {
  const styles = useStyles();
  return (
    <section className={styles.panel} aria-label={label}>
      {children}
    </section>
  );
}

/** The panel's own title row. Actions sit at its end. */
export function FluentPanelHeader({ title, children }: { title: string; children?: ReactNode }) {
  const styles = useStyles();
  return (
    <div className={styles.header}>
      <h2 className={styles.title}>{title}</h2>
      {children}
    </div>
  );
}

export function FluentPanelScroll({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return <div className={styles.scroll}>{children}</div>;
}

/** A padded block inside a panel. */
export function FluentPanelPad({ children, className }: { children: ReactNode; className?: string }) {
  const styles = useStyles();
  return <div className={mergeClasses(styles.pad, className)}>{children}</div>;
}

/** A heading inside a panel, optionally with a count of what it holds. */
export function FluentSectionTitle({ children, count }: { children: ReactNode; count?: number }) {
  const styles = useStyles();
  return (
    <h3 className={mergeClasses(styles.sectionTitle, count !== undefined && styles.sectionTitleCount)}>
      {children}
      {count === undefined ? null : <span className={styles.count}>{count}</span>}
    </h3>
  );
}

/** A field label in a panel row. */
export function FluentFieldLabel({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return <span className={styles.label}>{children}</span>;
}

/** A read-only value in the Sketch section: tabular, so numbers line up. */
export function FluentValue({ children, title }: { children: ReactNode; title?: string }) {
  const styles = useStyles();
  return (
    <span className={styles.value} title={title}>
      {children}
    </span>
  );
}

export function FluentNavList({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return <ul className={styles.navList}>{children}</ul>;
}

export interface FluentNavRowProps {
  title: ReactNode;
  meta?: ReactNode;
  selected?: boolean;
  onSelect: () => void;
  /** Rendered at the row's end, revealed on hover or focus (always, on touch). */
  actions?: ReactNode;
  titleAttr?: string;
}

/**
 * One choosable row: a saved sketch, an example.
 *
 * `aria-current` rather than `aria-selected`, because these are navigation
 * targets and not options in a listbox; the short brand bar on the leading edge
 * is drawn from that attribute, so the state cannot be styled without also being
 * announced.
 */
export function FluentNavRow({ title, meta, selected, onSelect, actions, titleAttr }: FluentNavRowProps) {
  const styles = useStyles();
  return (
    <li className={styles.navItem}>
      <button
        type="button"
        className={mergeClasses(styles.navRow, selected && styles.navRowSelected, !actions && styles.navRowPlain)}
        aria-current={selected ? 'true' : undefined}
        onClick={onSelect}
        title={titleAttr}
      >
        <span className={mergeClasses(styles.navTitle, styles.truncate, selected && styles.navTitleSelected)}>
          {title}
        </span>
        {meta ? <span className={styles.navMeta}>{meta}</span> : null}
      </button>
      {actions ? (
        <span className={styles.navActions} data-bf-actions="">
          {actions}
        </span>
      ) : null}
    </li>
  );
}

/**
 * The empty and error states. A sentence is allowed here and nowhere else, and
 * an action belongs beside it: an empty panel with no way out of it is the
 * failure this component exists to prevent.
 */
export function FluentEmpty({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return <div className={styles.empty}>{children}</div>;
}

export function FluentCaption({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return <Caption1 as="p" block className={styles.caption}>{children}</Caption1>;
}

export function FluentBody({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return <Body1 as="p" block className={styles.body}>{children}</Body1>;
}

/**
 * Loading. Stencil rows in the shape of the content, not a spinner, so the panel
 * does not change size when the real rows arrive. `aria-hidden` with a live label
 * beside it: a screen reader hears "loading your sketches", not nameless boxes.
 */
export function FluentSkeletonRows({ rows = 3, label }: { rows?: number; label: string }) {
  const styles = useStyles();
  return (
    <div role="status" aria-live="polite">
      <span className={styles.srOnly}>{label}</span>
      <Skeleton aria-hidden>
        {Array.from({ length: rows }, (_, row) => (
          <div key={row} className={styles.skeletonRow}>
            <SkeletonItem style={{ width: '70%' }} />
            <SkeletonItem style={{ width: '45%' }} />
          </div>
        ))}
      </Skeleton>
    </div>
  );
}

export type MessageIntent = 'info' | 'warning' | 'error';

/** Something the page has to say in place, rather than in a toast that leaves. */
export function FluentMessageBar({
  intent = 'info',
  children,
  actions,
}: {
  intent?: MessageIntent;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <MessageBar intent={intent} layout="multiline" role={intent === 'error' ? 'alert' : 'status'}>
      <MessageBarBody>{children}</MessageBarBody>
      {actions ? <MessageBarActions>{actions}</MessageBarActions> : null}
    </MessageBar>
  );
}

/** A line inside a multi-line message body. */
export function FluentMessageLine({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return <span className={styles.messageBlock}>{children}</span>;
}

export function FluentTagGroup({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return <div className={styles.tagGroup}>{children}</div>;
}

export interface FluentTagProps {
  selected?: boolean;
  onClick: () => void;
  children: ReactNode;
  title?: string;
  className?: string;
  style?: CSSProperties;
  'aria-label'?: string;
}

/**
 * A small chip that chooses something: a zoom step, a palette entry, a layout.
 *
 * A Fluent `ToggleButton`, so `aria-pressed` is present and true/false and is
 * what both announces and styles the chosen state — they cannot diverge.
 */
export function FluentTag({ selected = false, onClick, children, className, style, ...rest }: FluentTagProps) {
  const styles = useStyles();
  return (
    <ToggleButton
      appearance="subtle"
      size="small"
      shape="rounded"
      checked={selected}
      onClick={onClick}
      style={style}
      className={mergeClasses(styles.tag, className)}
      aria-label={rest['aria-label']}
      title={rest.title}
    >
      {children}
    </ToggleButton>
  );
}

/** Fluent's Switch, for the pixel-grid toggle. */
export function FluentSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <Switch checked={checked} onChange={(_e, data) => onChange(data.checked)} aria-label={label} />
  );
}

/** Re-export so panels can wrap an action in a Fluent tooltip without a second import. */
export { Tooltip as FluentTooltip };
