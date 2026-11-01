'use client';

import { ComponentSize } from '@genfeedai/contracts';
import type { ModalGalleryCreationsTabProps } from '@genfeedai/props/modals/modal-gallery.props';
import CollectionGrid from '@ui/collection/CollectionGrid';
import { EmptyState } from '@ui/primitives/empty-state';
import Spinner from '@ui/primitives/spinner';
import { Image } from 'lucide-react';
import ModalGalleryItemImage from '@/components/modals/gallery/items/ModalGalleryItemImage';

export default function ModalGalleryCreationsTab({
  creations,
  isLoadingCreations,
  localFormat,
  selectedItems,
  onSelectItem,
  getFormatLabel,
  getImageFormat,
}: ModalGalleryCreationsTabProps) {
  if (isLoadingCreations) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size={ComponentSize.LG} />
      </div>
    );
  }

  if (creations.length === 0) {
    return (
      <EmptyState
        icon={Image}
        title="No creations yet"
        description="Generate some images to see them here"
      />
    );
  }

  return (
    <CollectionGrid maxColumns={3}>
      {creations.map((creation) => (
        <ModalGalleryItemImage
          key={creation.id}
          image={creation}
          isSelected={selectedItems.includes(creation.id)}
          localFormat={localFormat}
          onSelect={onSelectItem}
          getFormatLabel={getFormatLabel}
          getImageFormat={getImageFormat}
        />
      ))}
    </CollectionGrid>
  );
}
