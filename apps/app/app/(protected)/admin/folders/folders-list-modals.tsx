'use client';

import type { FoldersListModalsProps } from '@props/admin/folders.props';
import { LazyModalFolder } from '@ui/lazy/modal/LazyModal';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';

export default function FoldersListModals({
  selectedFolder,
  onConfirm,
  scope,
}: FoldersListModalsProps) {
  return (
    <>
      <LazyModalFolder
        item={selectedFolder}
        onConfirm={onConfirm}
        scope={scope}
      />

      <div className="mt-4">
        <AutoPagination showTotal totalLabel="folders" />
      </div>
    </>
  );
}
