'use client';

import FoldersSidebarPanel from '@/features/ingredients/components/ingredients/list/folders-sidebar-panel/FoldersSidebarPanel';
import type { IngredientsListSidebarProps } from '@/features/ingredients/props/ingredients-list.props';

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
