/**
 * The folder explorer's tree, as pure data.
 *
 * Folders and the things filed in them arrive as two flat lists — each folder
 * naming its parent, each item naming its folder, null for the top level — and
 * leave as the nested tree the explorer draws and the flat row list its keyboard
 * walks. Nothing here knows what an item is: the panel maps its own rows onto
 * `TreeFolder` and `TreeItem` with string ids, which is what keeps this file the
 * same wherever a folder tree is wanted.
 *
 * Folders come first at every level, alphabetically, the way a file manager
 * lists them. Items follow in the chosen order: most recently edited first,
 * which is how the flat list read before folders existed, or by name.
 */

export interface TreeFolder {
  id: string;
  parentId: string | null;
  name: string;
}

export interface TreeItem {
  id: string;
  folderId: string | null;
  name: string;
  /** Anything that sorts as a string, newest last: ISO, or SQLite's `YYYY-MM-DD HH:MM:SS`. */
  updatedAt: string;
}

export type TreeSort = 'recent' | 'name';

export interface TreeNode {
  /** Unique across both kinds: `folder:<id>` or `item:<id>`. */
  key: string;
  kind: 'folder' | 'item';
  id: string;
  name: string;
  depth: number;
  /** A folder's items, however deep. An item counts itself. */
  count: number;
  /** The containing folder's key, or null at the top level. */
  parentKey: string | null;
  children: TreeNode[];
  item?: TreeItem;
}

export const folderKey = (id: string): string => `folder:${id}`;
export const itemKey = (id: string): string => `item:${id}`;

const byName = (left: { name: string }, right: { name: string }): number =>
  left.name.localeCompare(right.name, undefined, { sensitivity: 'base', numeric: true });

const byRecent = (left: TreeItem, right: TreeItem): number =>
  left.updatedAt === right.updatedAt ? byName(left, right) : left.updatedAt < right.updatedAt ? 1 : -1;

/**
 * Each folder's parent as the tree will actually hang it.
 *
 * A parent that is missing from the list (deleted a moment ago in another tab)
 * or a chain that loops back on itself (which no route writes, but a hand-edited
 * row could) would otherwise hide a folder and everything in it. Both are hung at
 * the top level instead: a folder shown in the wrong place can be moved, a folder
 * not shown at all cannot.
 */
function effectiveParents(folders: TreeFolder[]): Map<string, string | null> {
  const known = new Map(folders.map((folder) => [folder.id, folder]));
  const parents = new Map<string, string | null>();
  for (const folder of folders) {
    let parent = folder.parentId !== null && known.has(folder.parentId) ? folder.parentId : null;
    // Walk up until the top, a missing folder, or a loop above this one (whose
    // own members are hung at the top when their turn comes). Arriving back
    // here means this folder is IN the loop.
    const seen = new Set<string>();
    for (let at = parent; at !== null && !seen.has(at); at = known.get(at)?.parentId ?? null) {
      if (at === folder.id) {
        parent = null;
        break;
      }
      seen.add(at);
    }
    parents.set(folder.id, parent);
  }
  return parents;
}

/** Whether a name matches the filter: a case-insensitive substring, blank matching everything. */
export function matchesQuery(name: string, query: string): boolean {
  const needle = query.trim().toLowerCase();
  return !needle || name.toLowerCase().includes(needle);
}

/**
 * Build the tree.
 *
 * With a filter, an item shows when its name matches, and a folder shows when
 * its own name matches (with everything in it, since that is what was found) or
 * when something under it does (with only the path down to that). An item whose
 * folder is missing is filed at the top level, for the same reason as above.
 */
export function buildFolderTree(
  folders: TreeFolder[],
  items: TreeItem[],
  options: { sort?: TreeSort; query?: string } = {},
): TreeNode[] {
  const sort = options.sort ?? 'recent';
  const query = options.query ?? '';
  const parents = effectiveParents(folders);
  const childFolders = new Map<string | null, TreeFolder[]>();
  for (const folder of folders) {
    const parent = parents.get(folder.id) ?? null;
    childFolders.set(parent, [...(childFolders.get(parent) ?? []), folder]);
  }
  const childItems = new Map<string | null, TreeItem[]>();
  for (const item of items) {
    const folder = item.folderId !== null && parents.has(item.folderId) ? item.folderId : null;
    childItems.set(folder, [...(childItems.get(folder) ?? []), item]);
  }

  const build = (parentId: string | null, depth: number, parentKey: string | null, showAll: boolean): TreeNode[] => {
    const nodes: TreeNode[] = [];
    for (const folder of [...(childFolders.get(parentId) ?? [])].sort(byName)) {
      const key = folderKey(folder.id);
      const own = showAll || matchesQuery(folder.name, query);
      const children = build(folder.id, depth + 1, key, own);
      if (!own && !children.length) continue;
      const count = children.reduce((sum, child) => sum + child.count, 0);
      nodes.push({ key, kind: 'folder', id: folder.id, name: folder.name, depth, count, parentKey, children });
    }
    const filed = (childItems.get(parentId) ?? []).filter((item) => showAll || matchesQuery(item.name, query));
    for (const item of filed.sort(sort === 'name' ? byName : byRecent)) {
      nodes.push({ key: itemKey(item.id), kind: 'item', id: item.id, name: item.name, depth, count: 1, parentKey, children: [], item });
    }
    return nodes;
  };
  return build(null, 0, null, false);
}

/** The rows on screen: every node whose ancestors are all open, in tree order. */
export function flattenVisible(roots: TreeNode[], expanded: ReadonlySet<string>): TreeNode[] {
  const rows: TreeNode[] = [];
  const walk = (node: TreeNode): void => {
    rows.push(node);
    if (node.kind === 'folder' && expanded.has(node.key)) node.children.forEach(walk);
  };
  roots.forEach(walk);
  return rows;
}

/** Every folder key in the tree, for "expand everything" while a filter is on. */
export function allFolderKeys(roots: TreeNode[]): string[] {
  const keys: string[] = [];
  const walk = (node: TreeNode): void => {
    if (node.kind !== 'folder') return;
    keys.push(node.key);
    node.children.forEach(walk);
  };
  roots.forEach(walk);
  return keys;
}

/** The keys of the folders above a folder, outermost first, so the selection can be revealed. */
export function ancestorKeys(folders: TreeFolder[], folderId: string | null): string[] {
  const parents = effectiveParents(folders);
  const keys: string[] = [];
  let at = folderId !== null && parents.has(folderId) ? folderId : null;
  while (at !== null && keys.length <= folders.length) {
    keys.unshift(folderKey(at));
    at = parents.get(at) ?? null;
  }
  return keys;
}

/** A folder and every folder under it: where that folder cannot be moved to. */
export function subtreeIds(folders: TreeFolder[], folderId: string): Set<string> {
  const parents = effectiveParents(folders);
  const inside = new Set<string>([folderId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const folder of folders) {
      const parent = parents.get(folder.id);
      if (!inside.has(folder.id) && parent !== null && parent !== undefined && inside.has(parent)) {
        inside.add(folder.id);
        grew = true;
      }
    }
  }
  return inside;
}

export interface FolderChoice {
  id: string;
  name: string;
  depth: number;
}

/**
 * Every folder as a flat, indented list in tree order: the "Move to" menu.
 *
 * `exclude` drops a folder and its whole subtree, which is where a folder being
 * moved cannot go.
 */
export function folderChoices(folders: TreeFolder[], exclude?: string): FolderChoice[] {
  const skip = exclude === undefined ? new Set<string>() : subtreeIds(folders, exclude);
  const choices: FolderChoice[] = [];
  const walk = (nodes: TreeNode[]): void => {
    for (const node of nodes) {
      if (node.kind !== 'folder' || skip.has(node.id)) continue;
      choices.push({ id: node.id, name: node.name, depth: node.depth });
      walk(node.children);
    }
  };
  walk(buildFolderTree(folders, []));
  return choices;
}

/**
 * Where something may be dropped or moved.
 *
 * Anything may go to the top level or into any folder, except that a folder
 * cannot go into itself or anything under it — the server refuses that too, but
 * a drop target that lights up and then fails is worse than one that never
 * lights. Moving something to where it already is, is not a move.
 */
export function canMoveTo(
  folders: TreeFolder[],
  moving: { kind: 'folder' | 'item'; id: string; currentParent: string | null },
  destination: string | null,
): boolean {
  if (destination === moving.currentParent) return false;
  if (moving.kind === 'folder' && destination !== null && subtreeIds(folders, moving.id).has(destination)) return false;
  return true;
}

/**
 * A name no sibling has yet, for a folder about to be created inline:
 * "New folder", then "New folder 2", and so on. The comparison ignores case
 * because the server's does.
 */
export function freshFolderName(folders: TreeFolder[], parentId: string | null, base = 'New folder'): string {
  const taken = new Set(folders.filter((folder) => folder.parentId === parentId).map((folder) => folder.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n += 1) if (!taken.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`;
}
