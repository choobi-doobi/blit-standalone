/**
 * The folder explorer: saved sketches as a tree of nested folders.
 *
 * Vault's Library explorer, redrawn in Blit's Fluent 2 chrome: a filter box, a
 * count with the sort and fold commands beside it, then the tree — a chevron and
 * a folder icon for each folder with how many sketches it holds at the end of
 * its row, a document icon for each sketch. Folders list first at every level.
 *
 * It is a WAI-ARIA tree with one Tab stop: the arrows walk the visible rows,
 * Right opens a folder (or steps into it), Left closes it (or steps out), Home
 * and End jump, Enter opens a sketch or toggles a folder, F2 renames in place,
 * Delete deletes, and Shift+F10 or the context-menu key opens the row's menu.
 * The same menu opens on a right-click and from the row's "…" button, which
 * shows on hover and focus and stays visible on a touch screen, where there is
 * no right-click to find it with.
 *
 * Anything can be dragged onto a folder, onto a row inside one (it lands beside
 * that row), or onto the top-level strip that appears while dragging. A closed
 * folder held under the pointer opens. A folder never lights up as a target for
 * itself or anything under it, because the server would refuse that move.
 *
 * Nothing here knows what a sketch is: the panel maps its rows onto
 * `TreeFolder` / `TreeItem` and the explorer calls back with ids.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import {
  Input,
  Menu,
  MenuDivider,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  SearchBox,
  makeStyles,
  mergeClasses,
  tokens,
  type PositioningVirtualElement,
} from '@fluentui/react-components';
import {
  AddRegular,
  ArrowCollapseAllRegular,
  ChevronDownRegular,
  ChevronRightRegular,
  CopyRegular,
  DeleteRegular,
  DocumentRegular,
  FolderAddRegular,
  FolderArrowRightRegular,
  FolderArrowUpRegular,
  FolderOpenRegular,
  FolderRegular,
  HistoryRegular,
  MoreHorizontalRegular,
  OpenRegular,
  RenameRegular,
  TextSortAscendingRegular,
  type FluentIcon,
} from '@fluentui/react-icons';
import { parseTimestamp, timestampLabel } from '../sdk/format';

import { FluentButton } from './fluent';
import {
  allFolderKeys,
  ancestorKeys,
  buildFolderTree,
  canMoveTo,
  flattenVisible,
  folderChoices,
  folderKey,
  freshFolderName,
  itemKey,
  type TreeFolder,
  type TreeItem,
  type TreeNode,
  type TreeSort,
} from '../lib/folderTree';
import { SKETCH_DRAG_TYPE } from '../lib/blitLibrary';

export interface FolderExplorerProps {
  /** What an item is called, singular and plural: `sketch` / `sketches`. */
  noun: { one: string; many: string };
  folders: TreeFolder[];
  items: TreeItem[];
  /** The open item, drawn selected and revealed. */
  selectedId: string | null;
  /** The open item has unsaved edits: a dot beside its name. */
  dirty?: boolean;
  /** localStorage key for the open folders and the sort. */
  storageKey: string;
  itemIcon?: FluentIcon;
  onOpen: (id: string) => void;
  /** Start a new item, filed in `folderId`. */
  onNewItem?: (folderId: string | null) => void;
  /** Resolves with the new folder's id, which then takes the focus. */
  onCreateFolder: (name: string, parentId: string | null) => Promise<string>;
  onRenameFolder: (id: string, name: string) => Promise<unknown>;
  onMoveFolder: (id: string, parentId: string | null) => Promise<unknown>;
  onDeleteFolder: (folder: TreeFolder) => void;
  onMoveItem: (id: string, folderId: string | null) => Promise<unknown>;
  onRenameItem?: (id: string, name: string) => Promise<unknown>;
  onDuplicateItem?: (id: string) => void;
  onDeleteItem?: (id: string) => void;
  /** Shown in place of the tree when there is nothing at all yet. */
  emptyState?: ReactNode;
}

/** The root of the tree, as a drop target and a menu scope. */
const ROOT = 'root';
/** How long a closed folder has to be dragged over before it opens. */
const SPRING_MS = 650;
const INDENT = 16;

const useStyles = makeStyles({
  explorer: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
  },
  tools: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '0 8px 4px 12px',
  },
  toolRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    minHeight: '28px',
  },
  summary: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
    fontVariantNumeric: 'tabular-nums',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  search: {
    width: '100%',
    maxWidth: 'none',
  },
  tree: {
    display: 'flex',
    flexDirection: 'column',
    padding: '2px 4px 8px',
    outlineStyle: 'none',
    borderRadius: tokens.borderRadiusMedium,
  },
  row: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    minHeight: '28px',
    paddingInlineEnd: '4px',
    borderRadius: tokens.borderRadiusMedium,
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase300,
    lineHeight: tokens.lineHeightBase300,
    cursor: 'pointer',
    userSelect: 'none',
    ':hover': {
      background: tokens.colorSubtleBackgroundHover,
      color: tokens.colorNeutralForeground2Hover,
    },
    ':focus-visible': {
      outlineStyle: 'none',
      boxShadow: `inset 0 0 0 2px ${tokens.colorStrokeFocus2}`,
    },
    '&:hover [data-bf-row-actions], &:focus-within [data-bf-row-actions], &[data-menu-open] [data-bf-row-actions]': {
      opacity: 1,
    },
    '@media (pointer: coarse)': {
      '& [data-bf-row-actions]': { opacity: 1 },
    },
  },
  rowSelected: {
    background: tokens.colorSubtleBackgroundSelected,
    color: tokens.colorNeutralForeground1,
    fontWeight: tokens.fontWeightSemibold,
    '::before': {
      content: '""',
      position: 'absolute',
      top: '50%',
      left: 0,
      width: '3px',
      height: '16px',
      marginTop: '-8px',
      borderRadius: tokens.borderRadiusSmall,
      background: tokens.colorCompoundBrandForeground1,
    },
  },
  rowDrop: {
    background: tokens.colorBrandBackground2,
    color: tokens.colorNeutralForeground1,
    boxShadow: `inset 0 0 0 1px ${tokens.colorCompoundBrandStroke}`,
  },
  rowDragging: {
    opacity: 0.5,
  },
  chevron: {
    display: 'flex',
    flex: 'none',
    width: '16px',
    justifyContent: 'center',
    color: tokens.colorNeutralForeground3,
    fontSize: '12px',
  },
  icon: {
    flex: 'none',
    color: tokens.colorNeutralForeground3,
    fontSize: '16px',
  },
  folderIcon: {
    color: tokens.colorCompoundBrandForeground1,
  },
  name: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  count: {
    flex: 'none',
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    fontVariantNumeric: 'tabular-nums',
    fontWeight: tokens.fontWeightRegular,
  },
  dot: {
    flex: 'none',
    width: '6px',
    height: '6px',
    borderRadius: tokens.borderRadiusCircular,
    background: tokens.colorPaletteMarigoldForeground1,
  },
  actions: {
    display: 'flex',
    flex: 'none',
    opacity: 0,
  },
  editor: {
    flex: 1,
    minWidth: 0,
  },
  editError: {
    margin: '2px 0 4px',
    color: tokens.colorPaletteRedForeground1,
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
  },
  rootStrip: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    minHeight: '28px',
    marginTop: '4px',
    paddingInline: '8px',
    border: `1px dashed ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
  },
  rootStripActive: {
    borderTopColor: tokens.colorCompoundBrandStroke,
    borderRightColor: tokens.colorCompoundBrandStroke,
    borderBottomColor: tokens.colorCompoundBrandStroke,
    borderLeftColor: tokens.colorCompoundBrandStroke,
    background: tokens.colorBrandBackground2,
    color: tokens.colorNeutralForeground1,
  },
  empty: {
    margin: 0,
    padding: '6px 8px',
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
  },
  menuScroll: {
    maxHeight: '320px',
    overflowY: 'auto',
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
});

interface StoredState {
  expanded: string[];
  sort: TreeSort;
}

function readStored(key: string): StoredState {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? 'null') as Partial<StoredState> | null;
    return {
      expanded: Array.isArray(parsed?.expanded) ? parsed.expanded.filter((k): k is string => typeof k === 'string') : [],
      sort: parsed?.sort === 'name' ? 'name' : 'recent',
    };
  } catch {
    return { expanded: [], sort: 'recent' };
  }
}

function writeStored(key: string, state: StoredState): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // A private window, or storage full: the tree still works, it just forgets.
  }
}

/** A point on screen, as the thing a Fluent menu is positioned against. */
function pointTarget(x: number, y: number): PositioningVirtualElement {
  return {
    getBoundingClientRect: () => ({ x, y, top: y, left: x, bottom: y, right: x, width: 0, height: 0 }),
  };
}

type Editing =
  | { mode: 'rename'; key: string; initial: string }
  | { mode: 'create'; parentId: string | null; initial: string };

interface MenuState {
  /** A row's key, or ROOT for the empty space. */
  key: string;
  target: HTMLElement | PositioningVirtualElement;
}

const errorMessage = (error: unknown): string => (error instanceof Error && error.message) || 'That did not work.';

export default function FolderExplorer({
  noun,
  folders,
  items,
  selectedId,
  dirty = false,
  storageKey,
  itemIcon: ItemIcon = DocumentRegular,
  onOpen,
  onNewItem,
  onCreateFolder,
  onRenameFolder,
  onMoveFolder,
  onDeleteFolder,
  onMoveItem,
  onRenameItem,
  onDuplicateItem,
  onDeleteItem,
  emptyState,
}: FolderExplorerProps) {
  const styles = useStyles();
  const [stored] = useState(() => readStored(storageKey));
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(stored.expanded));
  const [sort, setSort] = useState<TreeSort>(stored.sort);
  const [query, setQuery] = useState('');
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dropKey, setDropKey] = useState<string | null>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  const springRef = useRef<{ key: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  /** The row focus returns to when a menu or an inline edit closes. */
  const returnFocusRef = useRef<string | null>(null);

  useEffect(() => writeStored(storageKey, { expanded: [...expanded], sort }), [storageKey, expanded, sort]);

  const filtering = query.trim().length > 0;
  const roots = useMemo(() => buildFolderTree(folders, items, { sort, query }), [folders, items, sort, query]);
  // A filter opens every folder it leaves standing, without forgetting which
  // ones were open before it: clearing the filter puts the tree back.
  const openKeys = useMemo(() => (filtering ? new Set(allFolderKeys(roots)) : expanded), [filtering, roots, expanded]);
  const rows = useMemo(() => flattenVisible(roots, openKeys), [roots, openKeys]);
  const byKey = useMemo(() => {
    const map = new Map<string, TreeNode>();
    const walk = (node: TreeNode): void => {
      map.set(node.key, node);
      node.children.forEach(walk);
    };
    roots.forEach(walk);
    return map;
  }, [roots]);
  const folderById = useMemo(() => new Map(folders.map((folder) => [folder.id, folder])), [folders]);

  const toggle = useCallback((key: string, open?: boolean) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (open ?? !next.has(key)) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  // Reveal the open item: its folders open, and it becomes the Tab stop.
  const selectedItem = selectedId === null ? undefined : items.find((item) => item.id === selectedId);
  const selectedFolder = selectedItem?.folderId ?? null;
  useEffect(() => {
    if (!selectedId) return;
    const path = ancestorKeys(folders, selectedFolder);
    if (path.length) setExpanded((previous) => (path.every((key) => previous.has(key)) ? previous : new Set([...previous, ...path])));
    setFocusKey(itemKey(selectedId));
    // Folders as a dependency would re-open a folder the user just closed
    // whenever any folder changed; the reveal is for a change of selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, selectedFolder]);

  const rowElement = useCallback(
    (key: string): HTMLElement | null =>
      [...(treeRef.current?.querySelectorAll<HTMLElement>('[data-node-key]') ?? [])].find((el) => el.dataset.nodeKey === key) ?? null,
    [],
  );
  const focusRow = useCallback(
    (key: string) => {
      setFocusKey(key);
      rowElement(key)?.focus();
    },
    [rowElement],
  );

  // After an edit or a menu closes, hand the keyboard back to its row — once the
  // row exists, which for a just-created folder is after the list refetches.
  useEffect(() => {
    const key = returnFocusRef.current;
    if (!key || editing || menu) return;
    const element = rowElement(key);
    if (!element) return;
    returnFocusRef.current = null;
    setFocusKey(key);
    element.focus();
  }, [rows, editing, menu, rowElement]);

  // The Tab stop: the focused row if it is still on screen, else the open item, else the first row.
  const tabStop = rows.find((row) => row.key === focusKey)?.key ?? rows.find((row) => row.item?.id === selectedId)?.key ?? rows[0]?.key;

  // ── Editing ────────────────────────────────────────────────────────────────

  const startRename = (node: TreeNode) => {
    if (node.kind === 'item' && !onRenameItem) return;
    returnFocusRef.current = node.key;
    setEditing({ mode: 'rename', key: node.key, initial: node.name });
  };
  const startCreate = (parentId: string | null) => {
    if (parentId !== null) toggle(folderKey(parentId), true);
    setQuery('');
    setEditing({ mode: 'create', parentId, initial: freshFolderName(folders, parentId) });
  };
  const commitEdit = async (value: string): Promise<void> => {
    if (!editing) return;
    const name = value.trim();
    if (editing.mode === 'create') {
      if (!name) {
        setEditing(null);
        return;
      }
      const id = await onCreateFolder(name, editing.parentId);
      returnFocusRef.current = folderKey(id);
    } else {
      const node = byKey.get(editing.key);
      if (node && name && name !== node.name) {
        await (node.kind === 'folder' ? onRenameFolder(node.id, name) : onRenameItem?.(node.id, name));
      }
    }
    setEditing(null);
  };

  // ── Moving ─────────────────────────────────────────────────────────────────

  const parentOf = (node: TreeNode): string | null =>
    node.kind === 'folder' ? (folderById.get(node.id)?.parentId ?? null) : (node.item?.folderId ?? null);
  const moveAllowed = (node: TreeNode, destination: string | null): boolean =>
    canMoveTo(folders, { kind: node.kind, id: node.id, currentParent: parentOf(node) }, destination);
  const move = (node: TreeNode, destination: string | null): void => {
    if (!moveAllowed(node, destination)) return;
    if (destination !== null) toggle(folderKey(destination), true);
    void (node.kind === 'folder' ? onMoveFolder(node.id, destination) : onMoveItem(node.id, destination)).catch(() => {});
  };

  /** A drop on a row lands in the folder it is, or the folder it is in. */
  const destinationFor = (node: TreeNode): string | null => (node.kind === 'folder' ? node.id : (node.item?.folderId ?? null));
  const endDrag = () => {
    if (springRef.current) clearTimeout(springRef.current.timer);
    springRef.current = null;
    setDragKey(null);
    setDropKey(null);
  };
  const dragOver = (event: DragEvent, destination: string | null, springKey?: string) => {
    const dragged = dragKey ? byKey.get(dragKey) : undefined;
    if (!dragged || !moveAllowed(dragged, destination)) {
      setDropKey(null);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    setDropKey(destination === null ? ROOT : folderKey(destination));
    if (springKey && !openKeys.has(springKey) && springRef.current?.key !== springKey) {
      if (springRef.current) clearTimeout(springRef.current.timer);
      springRef.current = { key: springKey, timer: setTimeout(() => toggle(springKey, true), SPRING_MS) };
    }
  };
  const drop = (event: DragEvent, destination: string | null) => {
    const dragged = dragKey ? byKey.get(dragKey) : undefined;
    event.preventDefault();
    event.stopPropagation();
    endDrag();
    if (dragged) move(dragged, destination);
  };

  // ── Menus ──────────────────────────────────────────────────────────────────

  const openMenu = (key: string, target: HTMLElement | PositioningVirtualElement) => {
    if (key !== ROOT) {
      setFocusKey(key);
      returnFocusRef.current = key;
    }
    setMenu({ key, target });
  };
  const contextMenu = (event: MouseEvent, key: string) => {
    event.preventDefault();
    event.stopPropagation();
    openMenu(key, pointTarget(event.clientX, event.clientY));
  };

  const moveMenu = (node: TreeNode) => {
    const here = parentOf(node);
    const choices = folderChoices(folders, node.kind === 'folder' ? node.id : undefined);
    return (
      <Menu>
        <MenuTrigger disableButtonEnhancement>
          <MenuItem icon={<FolderArrowRightRegular />}>Move to</MenuItem>
        </MenuTrigger>
        <MenuPopover>
          <MenuList className={styles.menuScroll}>
            <MenuItem icon={<FolderArrowUpRegular />} disabled={here === null} onClick={() => move(node, null)}>
              Top level
            </MenuItem>
            {choices.length > 0 && <MenuDivider />}
            {choices.map((choice) => (
              <MenuItem
                key={choice.id}
                icon={<FolderRegular />}
                disabled={choice.id === here}
                onClick={() => move(node, choice.id)}
                style={{ paddingInlineStart: `${8 + choice.depth * 12}px` }}
              >
                {choice.name}
              </MenuItem>
            ))}
          </MenuList>
        </MenuPopover>
      </Menu>
    );
  };

  const menuFor = (key: string) => {
    if (key === ROOT) {
      return (
        <>
          <MenuItem icon={<FolderAddRegular />} onClick={() => startCreate(null)}>
            New folder
          </MenuItem>
          {onNewItem && (
            <MenuItem icon={<AddRegular />} onClick={() => onNewItem(null)}>
              New {noun.one}
            </MenuItem>
          )}
          <MenuItem icon={<ArrowCollapseAllRegular />} onClick={() => setExpanded(new Set())}>
            Collapse all
          </MenuItem>
        </>
      );
    }
    const node = byKey.get(key);
    if (!node) return null;
    if (node.kind === 'folder') {
      const folder = folderById.get(node.id);
      return (
        <>
          {onNewItem && (
            <MenuItem icon={<AddRegular />} onClick={() => onNewItem(node.id)}>
              New {noun.one} here
            </MenuItem>
          )}
          <MenuItem icon={<FolderAddRegular />} onClick={() => startCreate(node.id)}>
            New folder inside
          </MenuItem>
          <MenuItem icon={<RenameRegular />} secondaryContent="F2" onClick={() => startRename(node)}>
            Rename
          </MenuItem>
          {moveMenu(node)}
          <MenuDivider />
          <MenuItem icon={<DeleteRegular />} secondaryContent="Del" onClick={() => folder && onDeleteFolder(folder)}>
            Delete folder
          </MenuItem>
        </>
      );
    }
    return (
      <>
        <MenuItem icon={<OpenRegular />} onClick={() => onOpen(node.id)}>
          Open
        </MenuItem>
        {onRenameItem && (
          <MenuItem icon={<RenameRegular />} secondaryContent="F2" onClick={() => startRename(node)}>
            Rename
          </MenuItem>
        )}
        {onDuplicateItem && (
          <MenuItem icon={<CopyRegular />} onClick={() => onDuplicateItem(node.id)}>
            Duplicate
          </MenuItem>
        )}
        {moveMenu(node)}
        {onDeleteItem && (
          <>
            <MenuDivider />
            <MenuItem icon={<DeleteRegular />} secondaryContent="Del" onClick={() => onDeleteItem(node.id)}>
              Delete
            </MenuItem>
          </>
        )}
      </>
    );
  };

  // ── Keyboard ───────────────────────────────────────────────────────────────

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (editing || !rows.length || event.target instanceof HTMLInputElement) return;
    // The row the key was pressed on, which is the truth even when a focus
    // event has not reached state yet; the remembered focus is the fallback.
    const pressed = (event.target as HTMLElement).closest<HTMLElement>('[data-node-key]')?.dataset.nodeKey;
    const index = Math.max(0, rows.findIndex((row) => row.key === (pressed ?? focusKey ?? tabStop)));
    const current = rows[index];
    const moveTo = (next: number) => {
      const target = rows[Math.max(0, Math.min(rows.length - 1, next))];
      if (target) focusRow(target.key);
    };
    const open = current.kind === 'folder' && openKeys.has(current.key);
    switch (event.key) {
      case 'ArrowDown':
        moveTo(index + 1);
        break;
      case 'ArrowUp':
        moveTo(index - 1);
        break;
      case 'Home':
        moveTo(0);
        break;
      case 'End':
        moveTo(rows.length - 1);
        break;
      case 'ArrowRight':
        if (current.kind !== 'folder') return;
        if (!open) toggle(current.key, true);
        else if (current.children.length) moveTo(index + 1);
        break;
      case 'ArrowLeft':
        if (open && !filtering) toggle(current.key, false);
        else if (current.parentKey) focusRow(current.parentKey);
        break;
      case 'Enter':
      case ' ':
        if (current.kind === 'item') onOpen(current.id);
        else if (!filtering) toggle(current.key);
        break;
      case 'F2':
        startRename(current);
        break;
      case 'Delete':
        if (current.kind === 'folder') {
          const folder = folderById.get(current.id);
          if (folder) onDeleteFolder(folder);
        } else if (onDeleteItem) onDeleteItem(current.id);
        else return;
        break;
      case 'ContextMenu':
      case 'F10': {
        if (event.key === 'F10' && !event.shiftKey) return;
        const element = rowElement(current.key);
        if (element) openMenu(current.key, element);
        break;
      }
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  // ── Rows ───────────────────────────────────────────────────────────────────

  const createRow = (depth: number, key: string) =>
    editing?.mode === 'create' ? (
      <InlineEditor
        key={key}
        depth={depth}
        folder
        label="New folder name"
        initial={editing.initial}
        onCommit={commitEdit}
        onCancel={() => setEditing(null)}
      />
    ) : null;

  const rendered: ReactNode[] = [];
  if (editing?.mode === 'create' && editing.parentId === null) rendered.push(createRow(0, 'create:root'));
  for (const node of rows) {
    if (editing?.mode === 'rename' && editing.key === node.key) {
      rendered.push(
        <InlineEditor
          key={node.key}
          depth={node.depth}
          folder={node.kind === 'folder'}
          label={`Rename ${node.name}`}
          initial={editing.initial}
          onCommit={commitEdit}
          onCancel={() => setEditing(null)}
        />,
      );
    } else {
      rendered.push(renderRow(node));
    }
    if (editing?.mode === 'create' && node.kind === 'folder' && node.id === editing.parentId) {
      rendered.push(createRow(node.depth + 1, `create:${node.key}`));
    }
  }

  function renderRow(node: TreeNode) {
    const isFolder = node.kind === 'folder';
    const open = isFolder && openKeys.has(node.key);
    const selected = !isFolder && node.id === selectedId;
    const Icon = isFolder ? (open ? FolderOpenRegular : FolderRegular) : ItemIcon;
    const Chevron = open ? ChevronDownRegular : ChevronRightRegular;
    const destination = destinationFor(node);
    const dropTarget = dragKey !== null && dropKey === (isFolder ? node.key : null);
    return (
      <div
        key={node.key}
        role="treeitem"
        data-node-key={node.key}
        aria-level={node.depth + 1}
        aria-expanded={isFolder ? open : undefined}
        aria-selected={selected}
        aria-current={selected ? 'true' : undefined}
        tabIndex={node.key === tabStop ? 0 : -1}
        draggable
        data-menu-open={menu?.key === node.key ? '' : undefined}
        title={
          isFolder
            ? `${node.name} (${node.count} ${node.count === 1 ? noun.one : noun.many})`
            : `${node.name}\nEdited ${timestampLabel(parseTimestamp(node.item?.updatedAt).getTime())}`
        }
        className={mergeClasses(
          styles.row,
          selected && styles.rowSelected,
          dropTarget && styles.rowDrop,
          dragKey === node.key && styles.rowDragging,
        )}
        style={{ paddingInlineStart: `${4 + node.depth * INDENT}px` }}
        onClick={() => {
          setFocusKey(node.key);
          if (isFolder) {
            if (!filtering) toggle(node.key);
          } else onOpen(node.id);
        }}
        onDoubleClick={() => {
          if (isFolder) return;
          startRename(node);
        }}
        onFocus={() => setFocusKey(node.key)}
        onContextMenu={(event) => contextMenu(event, node.key)}
        onDragStart={(event) => {
          // A sketch can also be dropped on the canvas, which places it there
          // (a copy, not a move), so it offers both.
          event.dataTransfer.effectAllowed = isFolder ? 'move' : 'copyMove';
          event.dataTransfer.setData('text/plain', node.name);
          if (!isFolder) event.dataTransfer.setData(SKETCH_DRAG_TYPE, String(node.id));
          setDragKey(node.key);
        }}
        onDragEnd={endDrag}
        onDragOver={(event) => dragOver(event, destination, isFolder ? node.key : undefined)}
        onDragLeave={(event) => {
          if (springRef.current?.key === node.key && !event.currentTarget.contains(event.relatedTarget as Node | null)) {
            clearTimeout(springRef.current.timer);
            springRef.current = null;
          }
        }}
        onDrop={(event) => drop(event, destination)}
      >
        <span className={styles.chevron} aria-hidden>
          {isFolder && <Chevron />}
        </span>
        <Icon className={mergeClasses(styles.icon, isFolder && styles.folderIcon)} aria-hidden />
        <span className={styles.name}>{node.name}</span>
        {selected && dirty && (
          <>
            <span className={styles.dot} aria-hidden />
            <span className={styles.srOnly}>, unsaved changes</span>
          </>
        )}
        {isFolder && (
          <span className={styles.count}>
            {node.count}
            <span className={styles.srOnly}> {node.count === 1 ? noun.one : noun.many}</span>
          </span>
        )}
        <span className={styles.actions} data-bf-row-actions="">
          <FluentButton
            size="small"
            tabIndex={-1}
            icon={<MoreHorizontalRegular />}
            aria-label={`More actions for ${node.name}`}
            onClick={(event) => {
              event.stopPropagation();
              openMenu(node.key, event.currentTarget);
            }}
            onDoubleClick={(event) => event.stopPropagation()}
          />
        </span>
      </div>
    );
  }

  const count = items.length;
  const shown = roots.reduce((sum, node) => sum + node.count, 0);
  const dragged = dragKey ? byKey.get(dragKey) : undefined;
  const offerRoot = dragged !== undefined && moveAllowed(dragged, null);

  return (
    <div className={styles.explorer}>
      <div className={styles.tools}>
        <SearchBox
          size="small"
          className={styles.search}
          value={query}
          placeholder={`Filter ${noun.many}`}
          aria-label={`Filter ${noun.many} by name`}
          onChange={(_event, data) => setQuery(data.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && query) {
              event.preventDefault();
              event.stopPropagation();
              setQuery('');
            }
          }}
        />
        <div className={styles.toolRow}>
          <span className={styles.summary} role="status">
            {filtering ? `${shown} of ${count} ${count === 1 ? noun.one : noun.many}` : `${count} ${count === 1 ? noun.one : noun.many}`}
          </span>
          <FluentButton
            size="small"
            icon={sort === 'recent' ? <HistoryRegular /> : <TextSortAscendingRegular />}
            aria-label={sort === 'recent' ? 'Sorted by last edit. Sort by name' : 'Sorted by name. Sort by last edit'}
            tooltip={sort === 'recent' ? 'Sorted by last edit. Sort by name' : 'Sorted by name. Sort by last edit'}
            onClick={() => setSort(sort === 'recent' ? 'name' : 'recent')}
          />
          <FluentButton
            size="small"
            icon={<FolderAddRegular />}
            aria-label="New folder"
            tooltip="New folder"
            onClick={() => {
              const focused = focusKey ? byKey.get(focusKey) : undefined;
              startCreate(focused?.kind === 'folder' ? focused.id : null);
            }}
          />
          <FluentButton
            size="small"
            icon={<ArrowCollapseAllRegular />}
            aria-label="Collapse all folders"
            tooltip="Collapse all"
            disabled={expanded.size === 0}
            onClick={() => setExpanded(new Set())}
          />
        </div>
      </div>

      <div
        ref={treeRef}
        role="tree"
        aria-label={`Saved ${noun.many}`}
        className={styles.tree}
        onKeyDown={onKeyDown}
        onContextMenu={(event) => contextMenu(event, ROOT)}
        onDragOver={(event) => dragOver(event, null)}
        onDrop={(event) => drop(event, null)}
      >
        {rendered}
        {!rows.length &&
          !editing &&
          (filtering ? (
            <p className={styles.empty}>No {noun.many} match “{query.trim()}”.</p>
          ) : (
            (emptyState ?? <p className={styles.empty}>No {noun.many} or folders yet.</p>)
          ))}
        {offerRoot && (
          <div
            className={mergeClasses(styles.rootStrip, dropKey === ROOT && styles.rootStripActive)}
            aria-hidden
            onDragOver={(event) => dragOver(event, null)}
            onDrop={(event) => drop(event, null)}
          >
            <FolderArrowUpRegular />
            Move to the top level
          </div>
        )}
      </div>

      <Menu
        open={menu !== null}
        onOpenChange={(_event, data) => {
          if (!data.open) setMenu(null);
        }}
        positioning={{ target: menu?.target ?? null, position: 'below', align: 'start' }}
      >
        <MenuPopover>
          <MenuList aria-label={menu && menu.key !== ROOT ? `${byKey.get(menu.key)?.name ?? ''} actions` : 'Explorer actions'}>
            {menu ? menuFor(menu.key) : null}
          </MenuList>
        </MenuPopover>
      </Menu>
    </div>
  );
}

/**
 * A row with a text field in it: renaming, or naming a new folder.
 *
 * Enter or leaving the field commits; Escape cancels. A refusal from the server
 * (a sibling already has the name) keeps the field open with the reason under
 * it, so the name can be fixed rather than retyped.
 */
function InlineEditor({
  depth,
  folder,
  label,
  initial,
  onCommit,
  onCancel,
}: {
  depth: number;
  folder: boolean;
  label: string;
  initial: string;
  onCommit: (value: string) => Promise<void>;
  onCancel: () => void;
}) {
  const styles = useStyles();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Refs, not state: a blur and an Enter can both arrive before a render, and
  // a stale `busy` in either handler's closure would send the name twice.
  const doneRef = useRef(false);
  const pendingRef = useRef(false);

  // A layout effect, so the field has the focus before anything else can look:
  // a menu that just closed hands focus back to what opened it once it sees
  // focus was lost, and taking the focus first is what keeps the field open.
  useLayoutEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const commit = async () => {
    if (doneRef.current || pendingRef.current) return;
    pendingRef.current = true;
    setBusy(true);
    try {
      await onCommit(value);
      doneRef.current = true;
    } catch (failure) {
      setError(errorMessage(failure));
      inputRef.current?.focus();
    } finally {
      pendingRef.current = false;
      setBusy(false);
    }
  };
  const cancel = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onCancel();
  };

  return (
    <div role="treeitem" aria-level={depth + 1} aria-selected={false} style={{ paddingInlineStart: `${4 + depth * INDENT}px` }}>
      <div className={styles.row}>
        <span className={styles.chevron} aria-hidden />
        {folder ? (
          <FolderRegular className={mergeClasses(styles.icon, styles.folderIcon)} aria-hidden />
        ) : (
          <DocumentRegular className={styles.icon} aria-hidden />
        )}
        <Input
          ref={inputRef}
          size="small"
          className={styles.editor}
          value={value}
          aria-label={label}
          aria-invalid={error ? true : undefined}
          readOnly={busy}
          onChange={(_event, data) => {
            setValue(data.value);
            setError(null);
          }}
          onBlur={() => {
            // Leaving a refused name gives up on it, the way Escape does, rather
            // than stranding an open field nobody is looking at.
            if (error) cancel();
            else void commit();
          }}
          onKeyDown={(event) => {
            // The tree's own keys (arrows, F2, Delete) stay out of the field.
            event.stopPropagation();
            if (event.key === 'Enter') {
              event.preventDefault();
              void commit();
            } else if (event.key === 'Escape') {
              // Escape leaves the edit; it does not also close a drawer around it.
              event.preventDefault();
              cancel();
            }
          }}
        />
      </div>
      {error && (
        <p className={styles.editError} role="alert" style={{ paddingInlineStart: '38px' }}>
          {error}
        </p>
      )}
    </div>
  );
}
