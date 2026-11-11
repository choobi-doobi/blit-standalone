/**
 * Blit's command-bar primitives, on the real Fluent 2 design system.
 *
 * These wrap `@fluentui/react-components` v9, themed to Blit's violet brand
 * (`lib/blitTheme`) by the `<FluentProvider>` in `pages/BlitPage.tsx`.
 * `lib/blitIdentity.test.ts` holds that boundary.
 *
 * Only the container keeps hand-written behaviour: `FluentToolbar` is a WAI-ARIA
 * toolbar with one tab stop and the arrows moving along it (a text field keeps
 * its caret keys). Everything the eye lands on — buttons, the name field, the
 * badges, the rule between groups — is a real Fluent component, coloured by the
 * theme's tokens rather than by a hand-authored skin.
 */
import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  Badge,
  Button,
  Divider,
  Input,
  Spinner,
  Tooltip,
  makeStyles,
  mergeClasses,
  tokens,
  type InputProps,
} from '@fluentui/react-components';

/** Marks a member of the toolbar's single tab stop. See `FluentToolbar`. */
const ITEM_ATTR = 'data-bf-item';
const ITEM_SELECTOR = `[${ITEM_ATTR}]`;

const useStyles = makeStyles({
  toolbar: {
    display: 'flex',
    flexWrap: 'nowrap',
    alignItems: 'center',
    columnGap: '4px',
    minWidth: 0,
    overflow: 'hidden',
  },
  spacer: {
    flex: '1 1 0%',
    minWidth: 0,
  },
  divider: {
    flex: 'none',
    width: '1px',
    height: '20px',
    marginInline: '4px',
  },
  status: {
    paddingInline: '4px',
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  },
  // The name field: capped so the one growing member does not stretch into a
  // rule across the whole bar. The slack goes to the spacer instead.
  field: {
    width: '100%',
    maxWidth: '240px',
  },
});

export interface FluentButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'disabled'> {
  /** `subtle` is the bar's default; `primary` for the one main action; `secondary` beside it. */
  appearance?: 'subtle' | 'primary' | 'secondary';
  size?: 'medium' | 'small';
  icon?: ReactElement;
  /**
   * Fluent's `disabledFocusable`: a switched-off command still takes focus and
   * still shows its tooltip, instead of becoming a keyboard dead end.
   */
  disabled?: boolean;
  /** Working. Reads as disabled and shows a spinner, without changing width. */
  busy?: boolean;
  /** A Fluent tooltip. Icon-only buttons label themselves with it; others describe. */
  tooltip?: string;
}

export const FluentButton = forwardRef<HTMLButtonElement, FluentButtonProps>(function FluentButton(
  { appearance = 'subtle', size = 'medium', icon, disabled, busy, tooltip, children, ...rest },
  ref,
) {
  const off = Boolean(disabled) || Boolean(busy);
  const iconOnly = children === undefined || children === null || children === false;
  const button = (
    <Button
      {...rest}
      ref={ref}
      appearance={appearance}
      size={size}
      icon={busy ? <Spinner size="tiny" /> : icon}
      disabledFocusable={off}
      aria-busy={busy || undefined}
      {...{ [ITEM_ATTR]: '' }}
    >
      {children}
    </Button>
  );
  return tooltip ? (
    <Tooltip content={tooltip} relationship={iconOnly ? 'label' : 'description'} withArrow>
      {button}
    </Tooltip>
  ) : (
    button
  );
});

/** The vertical rule between two groups of commands. */
export function FluentDivider() {
  const styles = useStyles();
  return <Divider vertical className={styles.divider} />;
}

/** Text on the bar that is a reading, not a command. */
export function FluentStatus({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return <span className={styles.status}>{children}</span>;
}

export function FluentBadge({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'warning' | 'brand';
  children: ReactNode;
}) {
  // Tint appearance so the badge reads as a status report, not a filled control.
  const color = tone === 'warning' ? 'warning' : tone === 'brand' ? 'brand' : 'informative';
  return (
    <Badge appearance={tone === 'neutral' ? 'outline' : 'tint'} color={color} shape="rounded" size="medium">
      {children}
    </Badge>
  );
}

/** Fluent's underline Input, for a name typed in place on the bar. */
export const FluentTitleField = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function FluentTitleField({ className, value, defaultValue, onChange, placeholder, ...rest }, ref) {
    const styles = useStyles();
    return (
      <Input
        appearance="underline"
        className={mergeClasses(styles.field, className)}
        value={value as string | undefined}
        defaultValue={defaultValue as string | undefined}
        // Fluent's onChange is `(ev, data)`; the native handler reads `ev.target`,
        // so it stays correct while ignoring the second argument.
        onChange={onChange as InputProps['onChange']}
        placeholder={placeholder}
        aria-label={rest['aria-label']}
        // The roving toolbar focuses the inner input directly, so the marker
        // rides on it, not the wrapper. Cast: a `data-*` attribute is not in the
        // slot's typed props, but Fluent spreads it to the element at runtime.
        input={{ ref, [ITEM_ATTR]: '' } as InputProps['input']}
      />
    );
  },
);

/**
 * A WAI-ARIA toolbar: ONE tab stop, with the arrow keys moving along it.
 *
 * Members mark themselves with `data-bf-item` (every primitive above does), and
 * the tab stop is whichever member was last focused. Arrow keys are NOT claimed
 * while a text field inside the bar has focus, where they move the caret; Home
 * and End are left alone for the same reason.
 */
export function FluentToolbar({
  children,
  label,
  className,
}: {
  children: ReactNode;
  label: string;
  className?: string;
}) {
  const styles = useStyles();
  const ref = useRef<HTMLDivElement | null>(null);

  const items = useCallback((): HTMLElement[] => {
    const root = ref.current;
    return root ? [...root.querySelectorAll<HTMLElement>(ITEM_SELECTOR)] : [];
  }, []);

  /** Exactly one member is reachable by Tab; `active` is which. */
  const setStop = useCallback(
    (active: HTMLElement | null) => {
      const all = items();
      const stop = active && all.includes(active) ? active : all[0];
      for (const el of all) el.tabIndex = el === stop ? 0 : -1;
    },
    [items],
  );

  useEffect(() => {
    setStop(null);
  });

  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label={label}
      aria-orientation="horizontal"
      className={mergeClasses(styles.toolbar, className)}
      onFocus={(e) => setStop(e.target as HTMLElement)}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.isContentEditable) return;
        const all = items();
        const from = all.indexOf(target);
        if (from < 0) return;
        // Wraps, as Fluent's own bar does: the end and the start are neighbours.
        const step = e.key === 'ArrowRight' ? 1 : -1;
        const next = all[(from + step + all.length) % all.length];
        e.preventDefault();
        setStop(next);
        next.focus();
      }}
    >
      {children}
    </div>
  );
}

/** Eats the bar's leftover width, so what follows it sits at the far end. */
export function FluentToolbarSpacer() {
  const styles = useStyles();
  return <div className={styles.spacer} aria-hidden />;
}
