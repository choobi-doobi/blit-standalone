/** Row shapes, matching server/migrations. */

export interface FoldersRow extends Record<string, unknown> {
  id: number;
  parent_id: number | null;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface SketchesRow extends Record<string, unknown> {
  id: number;
  name: string;
  code: string;
  created_at: string;
  updated_at: string;
  zoom: number;
  folder_id: number | null;
}
