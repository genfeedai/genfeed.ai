'use client';

import type { IngredientsListSidebarProps } from '@props/pages/ingredients-list.props';
import FoldersSidebarPanel from '@ui/ingredients/list/folders-sidebar-panel/FoldersSidebarPanel';

export default function IngredientsListSidebar({
  scope,
  folders,
  selectedFolderId,
  isLoading,
  onSelectFolder,
  onDropIngredient,
  onCreateFolder,
}: IngredientsListSidebarProps) {
  return (
    <FoldersSidebarPanel
      scope={scope}
      folders={folders}
      selectedFolderId={selectedFolderId}
      isLoading={isLoading}
      onSelectFolder={onSelectFolder}
      onDropIngredient={onDropIngredient}
      onCreateFolder={onCreateFolder}
    />
  );
}
