/**
 * The master bar: everything that is about the app rather than the sketch on
 * screen. File, View, Palettes and Export menus on the left, the command
 * palette in the middle, then Live, Mic, Help, Theme and Settings, and a
 * reading of the server and version at the far end.
 *
 * The sketch's own commands (transport, Run, Save, Scene, name) stay on the
 * Toolbar below it.
 */

import { useRef, type ReactElement, type ReactNode } from 'react';
import {
  Button,
  Menu,
  MenuDivider,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import {
  ArrowDownloadRegular,
  BookRegular,
  CheckmarkRegular,
  CopyRegular,
  DesktopRegular,
  DocumentAddRegular,
  FlashRegular,
  FolderOpenRegular,
  GridRegular,
  ImageAddRegular,
  KeyboardRegular,
  LayerDiagonalRegular,
  MicOffRegular,
  MicRegular,
  PanelLeftRegular,
  PanelRightRegular,
  QuestionCircleRegular,
  SearchRegular,
  SettingsRegular,
  ShareRegular,
  WeatherMoonRegular,
  WeatherSunnyRegular,
} from '@fluentui/react-icons';

import { FluentButton, FluentDivider } from './fluent';
import BlitLogo from './BlitLogo';
import { setPrefs, usePrefs, type ThemeChoice } from '../lib/prefs';
import { RAMPS } from '../lib/blit/palettes';
import { toCss } from '../lib/blit/color';
import { ZOOMS } from '../lib/zoom';

const useStyles = makeStyles({
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    height: '40px',
    flexShrink: 0,
    overflowX: 'auto',
    paddingInline: '8px',
    background: tokens.colorNeutralBackground1,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  brand: {
    display: 'flex',
    paddingInline: '2px 8px',
  },
  search: {
    flex: '1 1 0',
    maxWidth: '420px',
    marginInline: 'auto',
    justifyContent: 'flex-start',
    color: tokens.colorNeutralForeground3,
    fontWeight: tokens.fontWeightRegular,
  },
  kbd: {
    marginInlineStart: 'auto',
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase100,
  },
  status: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    paddingInline: '6px',
    whiteSpace: 'nowrap',
  },
  dotUp: { width: '8px', height: '8px', borderRadius: '50%', background: tokens.colorPaletteGreenForeground1 },
  dotDown: { width: '8px', height: '8px', borderRadius: '50%', background: tokens.colorPaletteRedForeground1 },
  swatches: { display: 'inline-flex', marginInlineStart: '8px' },
  swatch: { width: '8px', height: '12px' },
});

export interface MasterBarProps {
  version: string;
  serverUp: boolean | null;
  // File
  onNew: () => void;
  onOpen: () => void;
  onDuplicate: () => void;
  onImport: (file: File) => void;
  onShare: () => void;
  // Export
  busy: boolean;
  onExportFrame: () => void;
  onExportSheet: () => void;
  onExportAnimation: () => void;
  onExportAseprite: () => void;
  onExportSource: () => void;
  // View
  onToggleSketches: () => void;
  onToggleInspector: () => void;
  zoom: number;
  onZoom: (zoom: number) => void;
  showGrid: boolean;
  onShowGrid: (on: boolean) => void;
  // Palettes
  ramp: string;
  onRamp: (name: string) => void;
  // Tools
  mic: boolean;
  onMic: () => void;
  onPalette: () => void;
  onShortcuts: () => void;
  onDocs: () => void;
  onChangelog: () => void;
  onSettings: () => void;
}

const check = (on: boolean): ReactElement => (on ? <CheckmarkRegular /> : <span />);

function BarMenu({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Menu>
      <MenuTrigger disableButtonEnhancement>
        <Button appearance="subtle" size="small">
          {label}
        </Button>
      </MenuTrigger>
      <MenuPopover>
        <MenuList>{children}</MenuList>
      </MenuPopover>
    </Menu>
  );
}

const THEMES: { value: ThemeChoice; label: string; icon: ReactElement }[] = [
  { value: 'system', label: 'Follow system', icon: <DesktopRegular /> },
  { value: 'light', label: 'Light', icon: <WeatherSunnyRegular /> },
  { value: 'dark', label: 'Dark', icon: <WeatherMoonRegular /> },
];

export default function MasterBar(p: MasterBarProps) {
  const styles = useStyles();
  const prefs = usePrefs();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const themeIcon = THEMES.find((t) => t.value === prefs.theme)?.icon ?? <DesktopRegular />;

  return (
    <div className={styles.bar} role="menubar" aria-label="Blit">
      <span className={styles.brand}>
        <BlitLogo />
      </span>

      <BarMenu label="File">
        <MenuItem icon={<DocumentAddRegular />} onClick={p.onNew}>
          New sketch
        </MenuItem>
        <MenuItem icon={<FolderOpenRegular />} secondaryContent="Ctrl+K" onClick={p.onOpen}>
          Open…
        </MenuItem>
        <MenuItem icon={<CopyRegular />} onClick={p.onDuplicate}>
          Duplicate
        </MenuItem>
        <MenuDivider />
        <MenuItem icon={<ImageAddRegular />} onClick={() => fileRef.current?.click()}>
          Import PNG…
        </MenuItem>
        <MenuItem icon={<ShareRegular />} onClick={p.onShare}>
          Copy share link
        </MenuItem>
      </BarMenu>

      <BarMenu label="View">
        <MenuItem icon={<PanelLeftRegular />} onClick={p.onToggleSketches}>
          Sketches panel
        </MenuItem>
        <MenuItem icon={<PanelRightRegular />} onClick={p.onToggleInspector}>
          Inspector panel
        </MenuItem>
        <MenuDivider />
        {ZOOMS.map((z) => (
          <MenuItem key={z} icon={check(p.zoom === z)} onClick={() => p.onZoom(z)}>
            Zoom {z}x
          </MenuItem>
        ))}
        <MenuDivider />
        <MenuItem icon={p.showGrid ? <CheckmarkRegular /> : <GridRegular />} onClick={() => p.onShowGrid(!p.showGrid)}>
          Pixel grid
        </MenuItem>
        <MenuItem
          icon={prefs.onion ? <CheckmarkRegular /> : <LayerDiagonalRegular />}
          onClick={() => setPrefs({ onion: !prefs.onion })}
        >
          Onion skin
        </MenuItem>
        <MenuItem icon={check(prefs.checker)} onClick={() => setPrefs({ checker: !prefs.checker })}>
          Checkerboard
        </MenuItem>
      </BarMenu>

      <BarMenu label="Palettes">
        {Object.entries(RAMPS).map(([name, colors]) => (
          <MenuItem key={name} icon={check(p.ramp === name)} onClick={() => p.onRamp(name)}>
            {name}
            <span className={styles.swatches} aria-hidden>
              {colors.slice(0, 16).map((c, i) => (
                <span key={i} className={styles.swatch} style={{ background: toCss(c) }} />
              ))}
            </span>
          </MenuItem>
        ))}
      </BarMenu>

      <BarMenu label="Export">
        <MenuItem disabled={p.busy} onClick={p.onExportFrame}>
          This frame (PNG)
        </MenuItem>
        <MenuItem disabled={p.busy} onClick={p.onExportSheet}>
          Sprite sheet (PNG)
        </MenuItem>
        <MenuItem disabled={p.busy} onClick={p.onExportAnimation}>
          Animation (GIF)
        </MenuItem>
        <MenuItem disabled={p.busy} onClick={p.onExportAseprite}>
          Aseprite
        </MenuItem>
        <MenuDivider />
        <MenuItem icon={<ArrowDownloadRegular />} onClick={p.onExportSource}>
          Source (.js)
        </MenuItem>
      </BarMenu>

      <Button appearance="outline" size="small" icon={<SearchRegular />} className={styles.search} onClick={p.onPalette}>
        Search commands and sketches
        <span className={styles.kbd}>Ctrl+K</span>
      </Button>

      <FluentButton
        size="small"
        appearance={prefs.live ? 'secondary' : 'subtle'}
        aria-pressed={prefs.live}
        icon={<FlashRegular />}
        tooltip={prefs.live ? 'Live: runs as you type. Click to run only on Ctrl+Enter.' : 'Live coding: run as you type'}
        onClick={() => setPrefs({ live: !prefs.live })}
      >
        Live
      </FluentButton>
      <FluentButton
        size="small"
        appearance={p.mic ? 'secondary' : 'subtle'}
        aria-pressed={p.mic}
        icon={p.mic ? <MicRegular /> : <MicOffRegular />}
        tooltip={p.mic ? 'Stop the microphone' : 'Feed the microphone to `audio` in sketches'}
        onClick={p.onMic}
      />

      <FluentDivider />

      <Menu>
        <MenuTrigger disableButtonEnhancement>
          <FluentButton size="small" icon={<QuestionCircleRegular />} tooltip="Help" />
        </MenuTrigger>
        <MenuPopover>
          <MenuList>
            <MenuItem icon={<KeyboardRegular />} secondaryContent="?" onClick={p.onShortcuts}>
              Keyboard shortcuts
            </MenuItem>
            <MenuItem icon={<BookRegular />} onClick={p.onDocs}>
              Language reference
            </MenuItem>
            <MenuItem onClick={p.onChangelog}>What's new (v{p.version})</MenuItem>
          </MenuList>
        </MenuPopover>
      </Menu>

      <Menu>
        <MenuTrigger disableButtonEnhancement>
          <FluentButton size="small" icon={themeIcon} tooltip="Theme" />
        </MenuTrigger>
        <MenuPopover>
          <MenuList>
            {THEMES.map((t) => (
              <MenuItem key={t.value} icon={t.icon} onClick={() => setPrefs({ theme: t.value })}>
                {t.label}
                {prefs.theme === t.value ? ' ✓' : ''}
              </MenuItem>
            ))}
          </MenuList>
        </MenuPopover>
      </Menu>

      <FluentButton size="small" icon={<SettingsRegular />} tooltip="Settings" onClick={p.onSettings} />

      <span
        className={styles.status}
        title={p.serverUp === false ? 'Server unreachable: saving will fail' : 'Server connected'}
      >
        <span className={p.serverUp === false ? styles.dotDown : styles.dotUp} />v{p.version}
      </span>

      <input
        ref={fileRef}
        type="file"
        accept="image/png"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) p.onImport(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}
