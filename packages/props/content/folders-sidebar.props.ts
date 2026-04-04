import type { IFolder, IIngredient } from '@cloud/interfaces';

export interface FoldersSidebarProps {
  folders: IFolder[];
  selectedFolderId?: string | null;
  onSelectFolder?: (folder: IFolder | null) => void;
  onDropIngredient?: (ingredient: IIngredient, folder: IFolder | null) => void;
  onCreateFolder?: () => void;
  isLoading?: boolean;
}
