'use client';

import { ComponentSize } from '@genfeedai/contracts';
import type { IAsset } from '@genfeedai/contracts/interfaces';
import type { ModalGalleryReferencesTabProps } from '@genfeedai/props/modals/modal-gallery.props';
import CollectionGrid from '@ui/collection/CollectionGrid';
import ModalGalleryItemReference from '@ui/modals/gallery/items/ModalGalleryItemReference';
import Spinner from '@ui/primitives/spinner';

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
    return (
      <div className="text-center py-12 text-foreground/60">
        No brand references found.
      </div>
    );
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
