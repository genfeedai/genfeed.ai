import type { IFolder, IIngredient } from '@genfeedai/contracts/interfaces';

export interface FoldersSidebarProps {
  folders: IFolder[];
  selectedFolderId?: string | null;
  onSelectFolder?: (folder: IFolder | null) => void;
  onDropIngredient?: (ingredient: IIngredient, folder: IFolder | null) => void;
  onCreateFolder?: () => void;
  isLoading?: boolean;
  variant?: 'navigation' | 'panel';
}
