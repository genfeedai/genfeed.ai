import type { IFolder } from '@genfeedai/interfaces';

export interface FolderCardProps {
  folder: IFolder;
  onClick?: (folder: IFolder) => void;
}
