'use client';

import { ComponentSize, IngredientFormat } from '@genfeedai/enums';
import type { ModalGalleryItemImageProps } from '@genfeedai/props/modals/modal-gallery.props';
import Badge from '@ui/display/badge/Badge';
import MasonryImage from '@ui/masonry/image/MasonryImage';

export default function ModalGalleryItemImage({
  image,
  isSelected,
  localFormat,
  onSelect,
  getFormatLabel,
  getImageFormat,
}: ModalGalleryItemImageProps) {
  const imageFormat = getImageFormat(image);

  return (
    <div key={image.id} className="relative">
      <MasonryImage
        image={image}
        isSelected={isSelected}
        isActionsEnabled={false}
        isSquare={localFormat === IngredientFormat.SQUARE}
        isDragEnabled={false}
        onClickIngredient={() => onSelect(image)}
      />

      {/* Format badge */}
      {imageFormat && (
        <div className="absolute top-2 left-2 z-10">
          <Badge
            size={ComponentSize.SM}
            className="bg-black/70 backdrop-blur-sm text-white shadow-lg"
            value={getFormatLabel(imageFormat)}
          />
        </div>
      )}

      {isSelected && (
        <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold z-10">
          ✓
        </div>
      )}
    </div>
  );
}
