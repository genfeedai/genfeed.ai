'use client';

import { ComponentSize } from '@genfeedai/contracts';
import type { ModalGalleryCreationsTabProps } from '@genfeedai/props/modals/modal-gallery.props';
import CollectionGrid from '@ui/collection/CollectionGrid';
import Spinner from '@ui/feedback/spinner/Spinner';
import ModalGalleryItemImage from '@ui/modals/gallery/items/ModalGalleryItemImage';
import { Image } from 'lucide-react';

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
      <div className="text-center py-12">
        <Image className="text-5xl text-foreground/20 mx-auto mb-3" />
        <p className="text-foreground/60">No creations yet</p>
        <p className="text-sm text-foreground/40 mt-2">
          Generate some images to see them here
        </p>
      </div>
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
