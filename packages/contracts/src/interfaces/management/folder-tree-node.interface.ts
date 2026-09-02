import type { IFolder } from './folder.interface';

/**
 * One folder in the Library sidebar tree.
 *
 * `depth` is stamped while nesting so a row can indent itself without walking
 * back up to its parent on every render.
 */
export interface FolderTreeNode {
  folder: IFolder;
  children: FolderTreeNode[];
  depth: number;
}
