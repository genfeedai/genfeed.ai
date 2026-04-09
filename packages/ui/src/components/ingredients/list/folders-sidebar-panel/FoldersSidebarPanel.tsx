import { PageScope } from '@genfeedai/enums';
import type { IFolder, IIngredient } from '@genfeedai/interfaces';
import FoldersSidebar from '@ui/folders/sidebar/FoldersSidebar';

export interface FoldersSidebarPanelProps {
  scope: PageScope;
  folders: IFolder[];
  selectedFolderId?: string;
  isLoading?: boolean;
  onSelectFolder: (folder: IFolder | null) => void;
  onDropIngredient: (ingredient: IIngredient, folder: IFolder | null) => void;
  onCreateFolder: () => void;
}

export default function FoldersSidebarPanel({
  scope,
  folders,
  selectedFolderId,
  isLoading = false,
  onSelectFolder,
  onDropIngredient,
  onCreateFolder,
}: FoldersSidebarPanelProps) {
  if (scope === PageScope.SUPERADMIN) {
    return null;
  }

  return (
    <div className="w-full flex-shrink-0 lg:sticky lg:top-6 lg:w-56 lg:self-start">
      <FoldersSidebar
        folders={folders}
        selectedFolderId={selectedFolderId}
        onSelectFolder={onSelectFolder}
        onDropIngredient={onDropIngredient}
        onCreateFolder={onCreateFolder}
        isLoading={isLoading}
      />
    </div>
  );
}
