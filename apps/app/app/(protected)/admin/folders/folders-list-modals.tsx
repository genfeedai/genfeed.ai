'use client';

import type { IFolder } from '@genfeedai/interfaces';
import type { ContentProps } from '@props/layout/content.props';
import { LazyModalFolder } from '@ui/lazy/modal/LazyModal';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';

type FoldersListModalsProps = {
  selectedFolder: IFolder | null;
  onConfirm: () => void;
  scope: ContentProps['scope'];
};

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
