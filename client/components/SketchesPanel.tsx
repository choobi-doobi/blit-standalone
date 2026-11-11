/**
 * Primary panel: what is in this document.
 *
 * Saved sketches as a tree of folders (`FolderExplorer`), then the example
 * gallery as Fluent nav rows. The open sketch carries Fluent's short brand bar
 * on its leading edge in the tree; the examples list is not a selection, so
 * nothing in it is ever current.
 */

import type { ReactNode } from 'react';

import { AddRegular, ImageRegular } from '@fluentui/react-icons';

import FolderExplorer from './FolderExplorer';
import { FluentButton } from './fluent';
import {
  FluentBody,
  FluentEmpty,
  FluentMessageBar,
  FluentNavList,
  FluentNavRow,
  FluentPanel,
  FluentPanelHeader,
  FluentPanelPad,
  FluentPanelScroll,
  FluentSectionTitle,
  FluentSkeletonRows,
} from './fluentPanels';
import { EXAMPLES, type Example } from '../lib/examples';
import type { TreeFolder } from '../lib/folderTree';
import type { FolderRecord, SketchSummary } from '../api';

export interface SketchesPanelProps {
  sketches: SketchSummary[];
  folders: FolderRecord[];
  loading: boolean;
  error: boolean;
  currentId: number | null;
  /** The open sketch has edits that are not saved. */
  dirty?: boolean;
  onOpen: (id: number) => void;
  onDelete: (sketch: SketchSummary) => void;
  onRename: (sketch: SketchSummary, name: string) => Promise<unknown>;
  onMove: (sketch: SketchSummary, folderId: number | null) => Promise<unknown>;
  /** Start a new sketch; saving it files it in `folderId`. */
  onNew: (folderId: number | null) => void;
  onCreateFolder: (name: string, parentId: number | null) => Promise<FolderRecord>;
  onRenameFolder: (folder: FolderRecord, name: string) => Promise<unknown>;
  onMoveFolder: (folder: FolderRecord, parentId: number | null) => Promise<unknown>;
  onDeleteFolder: (folder: FolderRecord) => void;
  onLoadExample: (example: Example) => void;
  onRetry: () => void;
  /** The frame's own control (collapse, or close in the drawer). */
  headerAction?: ReactNode;
}

/** The tree speaks string ids; the API speaks integers. */
const ref = (id: number | null): string | null => (id === null ? null : String(id));
const num = (id: string | null): number | null => (id === null ? null : Number(id));

export default function SketchesPanel({
  sketches,
  folders,
  loading,
  error,
  currentId,
  dirty = false,
  onOpen,
  onDelete,
  onRename,
  onMove,
  onNew,
  onCreateFolder,
  onRenameFolder,
  onMoveFolder,
  onDeleteFolder,
  onLoadExample,
  onRetry,
  headerAction,
}: SketchesPanelProps) {
  const sketchById = new Map(sketches.map((sketch) => [String(sketch.id), sketch]));
  const folderById = new Map(folders.map((folder) => [String(folder.id), folder]));
  const treeFolders: TreeFolder[] = folders.map((folder) => ({ id: String(folder.id), parentId: ref(folder.parent_id), name: folder.name }));
  const withSketch = (id: string, act: (sketch: SketchSummary) => unknown) => {
    const sketch = sketchById.get(id);
    return sketch ? act(sketch) : undefined;
  };
  const withFolder = (id: string, act: (folder: FolderRecord) => Promise<unknown>) => {
    const folder = folderById.get(id);
    return folder ? act(folder) : Promise.resolve();
  };

  return (
    <FluentPanel label="Sketches">
      <FluentPanelHeader title="Sketches">
        <FluentButton size="small" onClick={() => onNew(null)} icon={<AddRegular />} tooltip="Start a new sketch">
          New
        </FluentButton>
        {headerAction}
      </FluentPanelHeader>

      <FluentPanelScroll>
        {loading && <FluentSkeletonRows rows={3} label="Loading your sketches" />}

        {error && !loading && (
          <FluentPanelPad>
            <FluentMessageBar
              intent="error"
              actions={
                <FluentButton size="small" onClick={onRetry}>
                  Retry
                </FluentButton>
              }
            >
              Couldn&apos;t load your sketches.
            </FluentMessageBar>
          </FluentPanelPad>
        )}

        {!loading && !error && (
          <FolderExplorer
            noun={{ one: 'sketch', many: 'sketches' }}
            storageKey="blit.explorer"
            itemIcon={ImageRegular}
            folders={treeFolders}
            items={sketches.map((sketch) => ({
              id: String(sketch.id),
              folderId: ref(sketch.folder_id),
              name: sketch.name,
              updatedAt: sketch.updated_at,
            }))}
            selectedId={currentId === null ? null : String(currentId)}
            dirty={dirty}
            onOpen={(id) => onOpen(Number(id))}
            onNewItem={(folderId) => onNew(num(folderId))}
            onCreateFolder={async (name, parentId) => String((await onCreateFolder(name, num(parentId))).id)}
            onRenameFolder={(id, name) => withFolder(id, (folder) => onRenameFolder(folder, name))}
            onMoveFolder={(id, parentId) => withFolder(id, (folder) => onMoveFolder(folder, num(parentId)))}
            onDeleteFolder={(folder) => {
              const record = folderById.get(folder.id);
              if (record) onDeleteFolder(record);
            }}
            onMoveItem={async (id, folderId) => withSketch(id, (sketch) => onMove(sketch, num(folderId)))}
            onRenameItem={async (id, name) => withSketch(id, (sketch) => onRename(sketch, name))}
            onDeleteItem={(id) => withSketch(id, onDelete)}
            emptyState={
              <FluentEmpty>
                <FluentBody>Nothing saved yet. Open an example, change it, then save it as your own.</FluentBody>
                <FluentButton appearance="secondary" onClick={() => onLoadExample(EXAMPLES[0])}>
                  Open {EXAMPLES[0].name}
                </FluentButton>
              </FluentEmpty>
            }
          />
        )}

        <FluentSectionTitle>Examples</FluentSectionTitle>
        <FluentNavList>
          {EXAMPLES.map((example) => (
            <FluentNavRow
              key={example.id}
              title={example.name}
              meta={example.teaches}
              onSelect={() => onLoadExample(example)}
            />
          ))}
        </FluentNavList>
      </FluentPanelScroll>
    </FluentPanel>
  );
}
