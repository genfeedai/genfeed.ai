import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { LazyModalFolder } from '@/components/lazy/modal/LazyModal';
import type { FoldersListModalsProps } from '@/features/admin/props/folders.props';

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
