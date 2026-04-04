import type { IFolder } from '@cloud/interfaces';

export interface FolderCardProps {
  folder: IFolder;
  onClick?: (folder: IFolder) => void;
}
