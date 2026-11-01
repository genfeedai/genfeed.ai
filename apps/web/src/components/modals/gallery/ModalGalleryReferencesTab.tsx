'use client';

import { ComponentSize } from '@genfeedai/contracts';
import type { IAsset } from '@genfeedai/contracts/interfaces';
import type { ModalGalleryReferencesTabProps } from '@genfeedai/props/modals/modal-gallery.props';
import CollectionGrid from '@ui/collection/CollectionGrid';
import { EmptyState } from '@ui/primitives/empty-state';
import Spinner from '@ui/primitives/spinner';
import ModalGalleryItemReference from '@/components/modals/gallery/items/ModalGalleryItemReference';

export default function ModalGalleryReferencesTab({
  references,
  isLoadingReferences,
  selectedItems,
  onSelectReference,
  onSelectionLimit,
  selectionLimit,
}: ModalGalleryReferencesTabProps) {
  if (isLoadingReferences) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size={ComponentSize.LG} />
      </div>
    );
  }

  if (references.length === 0) {
    return <EmptyState title="No brand references found." />;
  }

  return (
    <CollectionGrid maxColumns={3}>
      {references.map((ref: IAsset) => (
        <ModalGalleryItemReference
          key={ref.id}
          reference={ref}
          isSelected={selectedItems.includes(ref.id)}
          onSelect={onSelectReference}
          onSelectionLimit={onSelectionLimit}
          selectionLimit={selectionLimit}
          selectedItems={selectedItems}
        />
      ))}
    </CollectionGrid>
  );
}
