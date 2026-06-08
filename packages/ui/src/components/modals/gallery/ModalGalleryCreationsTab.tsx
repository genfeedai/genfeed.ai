'use client';

import { ComponentSize, IngredientFormat } from '@genfeedai/enums';
import type { ModalGalleryCreationsTabProps } from '@genfeedai/props/modals/modal-gallery.props';
import Masonry from '@ui/display/masonry/Masonry';
import Spinner from '@ui/feedback/spinner/Spinner';
import ModalGalleryItemImage from '@ui/modals/gallery/items/ModalGalleryItemImage';
import { HiPhoto } from 'react-icons/hi2';

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
        <HiPhoto className="text-5xl text-foreground/20 mx-auto mb-3" />
        <p className="text-foreground/60">No creations yet</p>
        <p className="text-sm text-foreground/40 mt-2">
          Generate some images to see them here
        </p>
      </div>
    );
  }

  // Use 3 columns for landscape format, otherwise use default responsive columns
  const columns =
    localFormat === IngredientFormat.LANDSCAPE
      ? {
          default: 3,
          lg: 3,
          md: 3,
          sm: 3,
        }
      : {
          default: 3,
          lg: 6,
          md: 5,
          sm: 4,
        };

  return (
    <Masonry
      key={`creations-${creations.length}`}
      gap={4}
      className="w-full"
      columns={columns}
    >
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
    </Masonry>
  );
}
