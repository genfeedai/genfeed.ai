'use client';

import { ComponentSize } from '@genfeedai/enums';
import type { IAsset } from '@genfeedai/interfaces';
import type { ModalGalleryReferencesTabProps } from '@genfeedai/props/modals/modal-gallery.props';
import Masonry from '@ui/display/masonry/Masonry';
import Spinner from '@ui/feedback/spinner/Spinner';
import ModalGalleryItemReference from '@ui/modals/gallery/items/ModalGalleryItemReference';

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
    <Masonry
      key={`references-${references.length}`}
      columns={{ default: 4, lg: 6, md: 6, sm: 5 }}
      gap={4}
      className="w-full"
    >
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
    </Masonry>
  );
}
