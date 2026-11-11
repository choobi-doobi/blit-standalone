import { describe, expect, it } from 'vitest';

import {
  allFolderKeys,
  ancestorKeys,
  buildFolderTree,
  canMoveTo,
  flattenVisible,
  folderChoices,
  freshFolderName,
  subtreeIds,
  type TreeFolder,
  type TreeItem,
  type TreeNode,
} from './folderTree';

const f = (id: string, name: string, parentId: string | null = null): TreeFolder => ({ id, name, parentId });
const i = (id: string, name: string, folderId: string | null = null, updatedAt = '2026-01-01 00:00:00'): TreeItem => ({
  id,
  name,
  folderId,
  updatedAt,
});

/** The tree as indented text, which reads as what the explorer draws. */
function outline(nodes: TreeNode[]): string[] {
  const lines: string[] = [];
  const walk = (node: TreeNode): void => {
    lines.push(`${'  '.repeat(node.depth)}${node.kind === 'folder' ? `${node.name}/ (${node.count})` : node.name}`);
    node.children.forEach(walk);
  };
  nodes.forEach(walk);
  return lines;
}

const FOLDERS = [f('1', 'Enemies'), f('2', 'bats', '1'), f('3', 'Tiles'), f('4', 'Caves', '2')];
const ITEMS = [
  i('a', 'Ship', null, '2026-01-03'),
  i('b', 'Plasma', null, '2026-01-05'),
  i('c', 'Vampire', '2', '2026-01-02'),
  i('d', 'Bat', '2', '2026-01-04'),
  i('e', 'Slime', '1'),
  i('f', 'Stalactite', '4'),
];

describe('buildFolderTree', () => {
  it('nests folders, lists folders before items, and counts every item however deep', () => {
    expect(outline(buildFolderTree(FOLDERS, ITEMS))).toEqual([
      'Enemies/ (4)',
      '  bats/ (3)',
      '    Caves/ (1)',
      '      Stalactite',
      '    Bat',
      '    Vampire',
      '  Slime',
      'Tiles/ (0)',
      'Plasma',
      'Ship',
    ]);
  });

  it('orders items by last edit by default and by name on request, folders always by name', () => {
    const top = (sort: 'recent' | 'name') => buildFolderTree(FOLDERS, ITEMS, { sort }).map((n) => n.name);
    expect(top('recent')).toEqual(['Enemies', 'Tiles', 'Plasma', 'Ship']);
    expect(top('name')).toEqual(['Enemies', 'Tiles', 'Plasma', 'Ship']);
    const bats = (sort: 'recent' | 'name') =>
      buildFolderTree(FOLDERS, ITEMS, { sort })[0].children[0].children.filter((n) => n.kind === 'item').map((n) => n.name);
    expect(bats('recent')).toEqual(['Bat', 'Vampire']);
    expect(bats('name')).toEqual(['Bat', 'Vampire']);
    const recentFirst = buildFolderTree([], [i('x', 'Alpha', null, '2026-01-01'), i('y', 'Zulu', null, '2026-02-01')]);
    expect(recentFirst.map((n) => n.name)).toEqual(['Zulu', 'Alpha']);
    const named = buildFolderTree([], [i('x', 'Alpha', null, '2026-01-01'), i('y', 'Zulu', null, '2026-02-01')], { sort: 'name' });
    expect(named.map((n) => n.name)).toEqual(['Alpha', 'Zulu']);
  });

  it('sorts names the way a person reads them: case aside, numbers by value', () => {
    const tree = buildFolderTree([f('1', 'level 10'), f('2', 'Level 2'), f('3', 'alpha')], []);
    expect(tree.map((n) => n.name)).toEqual(['alpha', 'Level 2', 'level 10']);
  });

  it('filters to matching items and the folders on the way to them', () => {
    expect(outline(buildFolderTree(FOLDERS, ITEMS, { query: 'stal' }))).toEqual([
      'Enemies/ (1)',
      '  bats/ (1)',
      '    Caves/ (1)',
      '      Stalactite',
    ]);
  });

  it('shows everything inside a folder whose own name matches', () => {
    expect(outline(buildFolderTree(FOLDERS, ITEMS, { query: 'BATS' }))).toEqual([
      'Enemies/ (3)',
      '  bats/ (3)',
      '    Caves/ (1)',
      '      Stalactite',
      '    Bat',
      '    Vampire',
    ]);
  });

  it('drops folders with nothing matching in them, and matches nothing when nothing matches', () => {
    expect(buildFolderTree(FOLDERS, ITEMS, { query: 'ship' }).map((n) => n.name)).toEqual(['Ship']);
    expect(buildFolderTree(FOLDERS, ITEMS, { query: 'zzz' })).toEqual([]);
  });

  it('hangs an item or folder whose parent is missing at the top level rather than losing it', () => {
    const tree = buildFolderTree([f('1', 'Orphan', 'gone')], [i('x', 'Stray', 'gone')]);
    expect(outline(tree)).toEqual(['Orphan/ (0)', 'Stray']);
  });

  it('hangs a folder loop at the top level rather than hiding it', () => {
    const loop = [f('1', 'A', '2'), f('2', 'B', '1'), f('3', 'C', '1')];
    const names = outline(buildFolderTree(loop, [i('x', 'Kept', '3')]));
    expect(names).toContain('A/ (1)');
    expect(names).toContain('B/ (0)');
    expect(names).toContain('  C/ (1)');
    expect(names).toContain('    Kept');
  });
});

describe('flattenVisible', () => {
  it('shows a folder’s children only while it is open', () => {
    const tree = buildFolderTree(FOLDERS, ITEMS);
    expect(flattenVisible(tree, new Set()).map((n) => n.name)).toEqual(['Enemies', 'Tiles', 'Plasma', 'Ship']);
    expect(flattenVisible(tree, new Set(['folder:1'])).map((n) => n.name)).toEqual([
      'Enemies',
      'bats',
      'Slime',
      'Tiles',
      'Plasma',
      'Ship',
    ]);
    // A closed parent hides an open child.
    expect(flattenVisible(tree, new Set(['folder:2'])).map((n) => n.name)).toEqual(['Enemies', 'Tiles', 'Plasma', 'Ship']);
  });

  it('knows every folder key, for opening everything under a filter', () => {
    expect(allFolderKeys(buildFolderTree(FOLDERS, ITEMS)).sort()).toEqual(['folder:1', 'folder:2', 'folder:3', 'folder:4']);
  });
});

describe('moving', () => {
  it('lists the folders above one, outermost first', () => {
    expect(ancestorKeys(FOLDERS, '4')).toEqual(['folder:1', 'folder:2', 'folder:4']);
    expect(ancestorKeys(FOLDERS, null)).toEqual([]);
  });

  it('knows a folder’s whole subtree', () => {
    expect([...subtreeIds(FOLDERS, '1')].sort()).toEqual(['1', '2', '4']);
    expect([...subtreeIds(FOLDERS, '3')]).toEqual(['3']);
  });

  it('refuses a folder into itself or below itself, and a move to where it already is', () => {
    const enemies = { kind: 'folder' as const, id: '1', currentParent: null };
    expect(canMoveTo(FOLDERS, enemies, '1')).toBe(false);
    expect(canMoveTo(FOLDERS, enemies, '4')).toBe(false);
    expect(canMoveTo(FOLDERS, enemies, null)).toBe(false);
    expect(canMoveTo(FOLDERS, enemies, '3')).toBe(true);
    const bat = { kind: 'item' as const, id: 'd', currentParent: '2' };
    expect(canMoveTo(FOLDERS, bat, '2')).toBe(false);
    expect(canMoveTo(FOLDERS, bat, '1')).toBe(true);
    expect(canMoveTo(FOLDERS, bat, null)).toBe(true);
  });

  it('offers every folder as a destination in tree order, minus a moving folder’s subtree', () => {
    expect(folderChoices(FOLDERS).map((c) => `${c.depth}:${c.name}`)).toEqual(['0:Enemies', '1:bats', '2:Caves', '0:Tiles']);
    expect(folderChoices(FOLDERS, '2').map((c) => c.name)).toEqual(['Enemies', 'Tiles']);
  });

  it('picks a name no sibling has, case aside', () => {
    expect(freshFolderName([], null)).toBe('New folder');
    expect(freshFolderName([f('1', 'new FOLDER'), f('2', 'New folder 2')], null)).toBe('New folder 3');
    expect(freshFolderName([f('1', 'New folder', '9')], null)).toBe('New folder');
  });
});
