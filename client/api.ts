/** Blit's API client: every call goes through `createApiClient`, which unwraps `{ success, data }`. */
import { createApiClient } from './sdk/api';

import type { ImportedSprite } from './lib/blit/importImage';
import type { DownscaleOption } from './lib/blit/resample';

export const api = createApiClient('/api/blit');

/** A row in the sketches list. The list omits `code`; the single read includes it. */
export interface SketchSummary {
  id: number;
  name: string;
  /** The folder it is filed in, or null at the top level. */
  folder_id: number | null;
  created_at: string;
  updated_at: string;
}

/** A folder in the virtual file system sketches are filed in. */
export interface FolderRecord {
  id: number;
  parent_id: number | null;
  name: string;
  created_at: string;
  updated_at: string;
}

/** What deleting a folder moved, and where it went. */
export interface FolderDeleted {
  id: number;
  parent_id: number | null;
  moved_sketches: number;
  moved_folders: number;
}

export interface SketchRecord extends SketchSummary {
  code: string;
  /** The zoom the canvas opens this sketch at, saved with it. See lib/zoom. */
  zoom: number;
}

export const sketchesApi = {
  list: (): Promise<SketchSummary[]> => api.get<SketchSummary[]>('/sketches'),
  get: (id: number): Promise<SketchRecord> => api.get<SketchRecord>(`/sketches/${id}`),
  create: (name: string, code: string, zoom: number, folderId: number | null = null): Promise<SketchRecord> =>
    api.post<SketchRecord>('/sketches', { name, code, zoom, folder_id: folderId }),
  update: (id: number, changes: { name?: string; code?: string; zoom?: number }): Promise<SketchRecord> =>
    api.patch<SketchRecord>(`/sketches/${id}`, changes),
  /** File it somewhere else. Not an edit: the sketch keeps its place in the recent list. */
  move: (id: number, folderId: number | null): Promise<SketchRecord> =>
    api.put<SketchRecord>(`/sketches/${id}/folder`, { folder_id: folderId }),
  remove: (id: number): Promise<void> => api.del<void>(`/sketches/${id}`),
};

export const foldersApi = {
  list: (): Promise<FolderRecord[]> => api.get<FolderRecord[]>('/folders'),
  create: (name: string, parentId: number | null): Promise<FolderRecord> =>
    api.post<FolderRecord>('/folders', { name, parent_id: parentId }),
  update: (id: number, changes: { name?: string; parent_id?: number | null }): Promise<FolderRecord> =>
    api.patch<FolderRecord>(`/folders/${id}`, changes),
  remove: (id: number): Promise<FolderDeleted> => api.del<FolderDeleted>(`/folders/${id}`),
};

/**
 * What `POST /api/blit/import` answers.
 *
 * `sprite` and `sketch` are absent together, and then `refusal` says why: an
 * image that needs a size and was not given one, or a grid at that size with more
 * colours than a literal can name. Both are 200s rather than errors because
 * `options` is the useful part of the answer and an error would throw it away —
 * see `routes/importPng.ts`.
 */
export interface ImportAnswer {
  source: { width: number; height: number };
  options: DownscaleOption[];
  sprite?: ImportedSprite;
  /** The same import as a whole sketch. The editor builds its own, from `sprite`. */
  sketch?: string;
  refusal?: string;
}

export const importApi = {
  /** What sizes could this be? Answers the import itself when it already fits. */
  sizes: (png: string): Promise<ImportAnswer> => api.post<ImportAnswer>('/import', { png }),
  /** Import at one of them. */
  at: (png: string, size: number): Promise<ImportAnswer> => api.post<ImportAnswer>('/import', { png, size }),
};
