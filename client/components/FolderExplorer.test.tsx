// @vitest-environment jsdom
/**
 * The folder explorer's DOM contracts, on the real Fluent 2 library.
 *
 * What is asserted is what a person or a screen reader gets: rows that are tree
 * items with the level and open state announced, the keyboard doing what the
 * WAI-ARIA tree pattern says, and every way of filing something — the menu, a
 * drag, an inline name — ending in the right callback with the right ids.
 * Drag and drop is driven with synthetic events here and again in a real
 * browser before release; jsdom has no layout to drag across.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';

import FolderExplorer, { type FolderExplorerProps } from './FolderExplorer';
import type { TreeFolder, TreeItem } from '../lib/folderTree';

const FOLDERS: TreeFolder[] = [
  { id: '1', parentId: null, name: 'Enemies' },
  { id: '2', parentId: '1', name: 'Bats' },
  { id: '3', parentId: null, name: 'Tiles' },
];
const ITEMS: TreeItem[] = [
  { id: '10', folderId: null, name: 'Ship', updatedAt: '2026-01-02 00:00:00' },
  { id: '11', folderId: '2', name: 'Vampire', updatedAt: '2026-01-01 00:00:00' },
  { id: '12', folderId: '1', name: 'Slime', updatedAt: '2026-01-01 00:00:00' },
];

function setup(overrides: Partial<FolderExplorerProps> = {}) {
  const props: FolderExplorerProps = {
    noun: { one: 'sketch', many: 'sketches' },
    folders: FOLDERS,
    items: ITEMS,
    selectedId: null,
    storageKey: 'test.explorer',
    onOpen: vi.fn(),
    onNewItem: vi.fn(),
    onCreateFolder: vi.fn(async () => '99'),
    onRenameFolder: vi.fn(async () => undefined),
    onMoveFolder: vi.fn(async () => undefined),
    onDeleteFolder: vi.fn(),
    onMoveItem: vi.fn(async () => undefined),
    onRenameItem: vi.fn(async () => undefined),
    onDeleteItem: vi.fn(),
    ...overrides,
  };
  const view = render(
    <FluentProvider theme={webLightTheme}>
      <FolderExplorer {...props} />
    </FluentProvider>,
  );
  return { props, view };
}

/** Focus a row the way a person does, with React told about it. */
const focus = (element: HTMLElement) => act(() => element.focus());
const item = (name: string) => screen.getByRole('treeitem', { name: new RegExp(`^${name}\\b`) });
const names = () => screen.queryAllByRole('treeitem').map((row) => row.querySelector('span:nth-of-type(2)')?.textContent ?? '');

/** A DataTransfer good enough for React's synthetic drag events. */
function transfer() {
  const data = new Map<string, string>();
  return {
    effectAllowed: 'all',
    dropEffect: 'none',
    setData: (type: string, value: string) => data.set(type, value),
    getData: (type: string) => data.get(type) ?? '',
    types: [] as string[],
  };
}

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe('FolderExplorer: the tree', () => {
  it('draws folders first with their counts, closed, and announces level and state', () => {
    setup();
    expect(names()).toEqual(['Enemies', 'Tiles', 'Ship']);
    const enemies = item('Enemies');
    expect(enemies.getAttribute('aria-level')).toBe('1');
    expect(enemies.getAttribute('aria-expanded')).toBe('false');
    // Two sketches however deep: Slime directly, Vampire inside Bats.
    expect(enemies.textContent).toContain('2');
    expect(item('Ship').hasAttribute('aria-expanded')).toBe(false);
    expect(screen.getByRole('status').textContent).toBe('3 sketches');
  });

  it('opens a folder on click and opens an item on click', () => {
    const { props } = setup();
    fireEvent.click(item('Enemies'));
    expect(item('Enemies').getAttribute('aria-expanded')).toBe('true');
    expect(names()).toEqual(['Enemies', 'Bats', 'Slime', 'Tiles', 'Ship']);
    expect(item('Bats').getAttribute('aria-level')).toBe('2');
    fireEvent.click(item('Slime'));
    expect(props.onOpen).toHaveBeenCalledWith('12');
  });

  it('reveals the open item inside closed folders and marks it current', () => {
    setup({ selectedId: '11' });
    const vampire = item('Vampire');
    expect(vampire.getAttribute('aria-level')).toBe('3');
    expect(vampire.getAttribute('aria-current')).toBe('true');
    expect(vampire.getAttribute('tabindex')).toBe('0');
    expect(item('Ship').getAttribute('tabindex')).toBe('-1');
  });

  it('shows the unsaved dot only on the open item', () => {
    setup({ selectedId: '10', dirty: true });
    expect(item('Ship').textContent).toContain('unsaved changes');
    fireEvent.click(item('Enemies'));
    expect(item('Slime').textContent).not.toContain('unsaved changes');
  });

  it('remembers which folders were open', () => {
    setup();
    fireEvent.click(item('Enemies'));
    cleanup();
    setup();
    expect(item('Enemies').getAttribute('aria-expanded')).toBe('true');
    expect(names()).toContain('Bats');
  });

  it('filters by name, opening the folders on the way, and counts what is left', () => {
    setup();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'vamp' } });
    expect(names()).toEqual(['Enemies', 'Bats', 'Vampire']);
    expect(screen.getByRole('status').textContent).toBe('1 of 3 sketches');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzz' } });
    expect(screen.getByText('No sketches match “zzz”.')).toBeTruthy();
  });

  it('switches between recent-first and by-name', () => {
    setup({
      folders: [],
      items: [
        { id: 'a', folderId: null, name: 'Alpha', updatedAt: '2026-01-01' },
        { id: 'z', folderId: null, name: 'Zulu', updatedAt: '2026-02-01' },
      ],
    });
    expect(names()).toEqual(['Zulu', 'Alpha']);
    fireEvent.click(screen.getByRole('button', { name: /Sort by name/ }));
    expect(names()).toEqual(['Alpha', 'Zulu']);
  });
});

describe('FolderExplorer: the keyboard', () => {
  it('walks the rows with the arrows and opens and closes folders with Right and Left', () => {
    const { props } = setup();
    const tree = screen.getByRole('tree');
    focus(item('Enemies'));
    fireEvent.keyDown(tree, { key: 'ArrowRight' });
    expect(item('Enemies').getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(tree, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(item('Bats'));
    fireEvent.keyDown(tree, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(item('Slime'));
    fireEvent.keyDown(tree, { key: 'Enter' });
    expect(props.onOpen).toHaveBeenCalledWith('12');
    fireEvent.keyDown(tree, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(item('Enemies'));
    fireEvent.keyDown(tree, { key: 'ArrowLeft' });
    expect(item('Enemies').getAttribute('aria-expanded')).toBe('false');
    fireEvent.keyDown(tree, { key: 'End' });
    expect(document.activeElement).toBe(item('Ship'));
  });

  it('renames in place with F2 and commits on Enter', async () => {
    const { props } = setup();
    focus(item('Tiles'));
    fireEvent.keyDown(screen.getByRole('tree'), { key: 'F2' });
    const field = screen.getByRole('textbox', { name: 'Rename Tiles' });
    expect(document.activeElement).toBe(field);
    fireEvent.change(field, { target: { value: 'Terrain' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    await waitFor(() => expect(props.onRenameFolder).toHaveBeenCalledWith('3', 'Terrain'));
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Rename Tiles' })).toBeNull());
  });

  it('cancels a rename on Escape without calling back', () => {
    const { props } = setup();
    focus(item('Ship'));
    fireEvent.keyDown(screen.getByRole('tree'), { key: 'F2' });
    const field = screen.getByRole('textbox', { name: 'Rename Ship' });
    fireEvent.change(field, { target: { value: 'Boat' } });
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(props.onRenameItem).not.toHaveBeenCalled();
  });

  it('deletes with Delete: a folder through its own callback, an item through its', () => {
    const { props } = setup();
    const tree = screen.getByRole('tree');
    focus(item('Tiles'));
    fireEvent.keyDown(tree, { key: 'Delete' });
    expect(props.onDeleteFolder).toHaveBeenCalledWith(FOLDERS[2]);
    focus(item('Ship'));
    fireEvent.keyDown(tree, { key: 'Delete' });
    expect(props.onDeleteItem).toHaveBeenCalledWith('10');
  });
});

describe('FolderExplorer: making and filing', () => {
  it('names a new folder inline and files it inside the focused folder', async () => {
    const { props } = setup();
    focus(item('Tiles'));
    fireEvent.click(screen.getByRole('button', { name: 'New folder' }));
    const field = screen.getByRole('textbox', { name: 'New folder name' }) as HTMLInputElement;
    expect(field.value).toBe('New folder');
    fireEvent.change(field, { target: { value: 'Grass' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    await waitFor(() => expect(props.onCreateFolder).toHaveBeenCalledWith('Grass', '3'));
  });

  it('keeps the field open with the reason when the server refuses the name', async () => {
    const onCreateFolder = vi.fn(async () => {
      throw new Error('A folder named “Tiles” is already there');
    });
    setup({ onCreateFolder });
    fireEvent.click(screen.getByRole('button', { name: 'New folder' }));
    const field = screen.getByRole('textbox', { name: 'New folder name' });
    fireEvent.change(field, { target: { value: 'tiles' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect((await screen.findByRole('alert')).textContent).toBe('A folder named “Tiles” is already there');
    expect(screen.getByRole('textbox', { name: 'New folder name' })).toBeTruthy();
    // Sent once, even though a blur and the Enter could both have fired it.
    expect(onCreateFolder).toHaveBeenCalledTimes(1);
  });

  it('moves an item from its menu, to the top level or into a folder, and not to where it is', async () => {
    const { props } = setup({ selectedId: '12' });
    fireEvent.contextMenu(item('Slime'));
    const menu = await screen.findByRole('menu');
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Move to' }));
    const submenu = (await screen.findAllByRole('menu')).at(-1)!;
    expect(within(submenu).getByRole('menuitem', { name: 'Enemies' }).getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(within(submenu).getByRole('menuitem', { name: 'Top level' }));
    expect(props.onMoveItem).toHaveBeenCalledWith('12', null);
  });

  it('offers a folder no destination inside itself', async () => {
    setup();
    fireEvent.contextMenu(item('Enemies'));
    const menu = await screen.findByRole('menu');
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Move to' }));
    const submenu = (await screen.findAllByRole('menu')).at(-1)!;
    const offered = within(submenu).getAllByRole('menuitem').map((entry) => entry.textContent);
    expect(offered).toEqual(['Top level', 'Tiles']);
  });

  it('files a dragged item in the folder it is dropped on', () => {
    const { props } = setup();
    const data = transfer();
    fireEvent.dragStart(item('Ship'), { dataTransfer: data });
    fireEvent.dragOver(item('Tiles'), { dataTransfer: data });
    expect(item('Tiles').className).not.toBe(item('Enemies').className);
    fireEvent.drop(item('Tiles'), { dataTransfer: data });
    expect(props.onMoveItem).toHaveBeenCalledWith('10', '3');
  });

  it('refuses to drop a folder into itself or below it, and offers the top level to a nested one', () => {
    const { props } = setup();
    fireEvent.click(item('Enemies'));
    const data = transfer();
    fireEvent.dragStart(item('Enemies'), { dataTransfer: data });
    fireEvent.drop(item('Bats'), { dataTransfer: data });
    fireEvent.drop(item('Enemies'), { dataTransfer: data });
    expect(props.onMoveFolder).not.toHaveBeenCalled();
    // Already at the top level, so the strip that means "move there" is not offered.
    expect(screen.queryByText('Move to the top level')).toBeNull();

    fireEvent.dragStart(item('Bats'), { dataTransfer: data });
    const strip = screen.getByText('Move to the top level');
    fireEvent.dragOver(strip, { dataTransfer: data });
    fireEvent.drop(strip, { dataTransfer: data });
    expect(props.onMoveFolder).toHaveBeenCalledWith('2', null);
  });

  it('opens a closed folder that is held under a drag', () => {
    vi.useFakeTimers();
    try {
      setup();
      const data = transfer();
      fireEvent.dragStart(item('Ship'), { dataTransfer: data });
      fireEvent.dragOver(item('Enemies'), { dataTransfer: data });
      expect(item('Enemies').getAttribute('aria-expanded')).toBe('false');
      act(() => {
        vi.advanceTimersByTime(700);
      });
      expect(item('Enemies').getAttribute('aria-expanded')).toBe('true');
    } finally {
      vi.useRealTimers();
    }
  });

  it('offers a new item filed in the folder its menu was opened on', async () => {
    const { props } = setup();
    fireEvent.contextMenu(item('Tiles'));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'New sketch here' }));
    expect(props.onNewItem).toHaveBeenCalledWith('3');
  });
});
