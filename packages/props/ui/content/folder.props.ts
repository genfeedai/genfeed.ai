import type { IFolder } from '@genfeedai/contracts/interfaces';

export interface FolderCardProps {
  folder: IFolder;
  onClick?: (folder: IFolder) => void;
}
