'use client';

import { ButtonVariant, IngredientFormat } from '@genfeedai/enums';
import type { ModalGalleryUploadsTabProps } from '@genfeedai/props/modals/modal-gallery.props';
import Masonry from '@ui/display/masonry/Masonry';
import { SkeletonList } from '@ui/display/skeleton/skeleton';
import ModalGalleryItemImage from '@ui/modals/gallery/items/ModalGalleryItemImage';
import { Button } from '@ui/primitives/button';
import { HiArrowUpTray } from 'react-icons/hi2';

export default function ModalGalleryUploadsTab({
  uploads,
  isLoading,
  localFormat,
  selectedItems,
  onSelectItem,
  getFormatLabel,
  getImageFormat,
  onUploadClick,
}: ModalGalleryUploadsTabProps) {
  if (isLoading) {
    return <SkeletonList count={12} />;
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

  const uploadCard = (
    <Button
      type="button"
      onClick={onUploadClick}
      variant={ButtonVariant.UNSTYLED}
      className="group relative aspect-square w-full border-2 border-dashed border-foreground/20 hover:border-primary hover:bg-primary/5 transition-all duration-200 flex flex-col items-center justify-center gap-2 cursor-pointer"
      ariaLabel="Upload image"
    >
      <HiArrowUpTray className="size-8 text-foreground/40 group-hover:text-primary transition-colors" />
      <span className="text-sm text-foreground/60 group-hover:text-primary transition-colors">
        Upload
      </span>
    </Button>
  );

  return (
    <Masonry
      key={`uploads-${uploads.length}`}
      gap={4}
      className="w-full"
      columns={columns}
    >
      {uploadCard}
      {uploads.map((upload) => (
        <ModalGalleryItemImage
          key={upload.id}
          image={upload}
          isSelected={selectedItems.includes(upload.id)}
          localFormat={localFormat}
          onSelect={onSelectItem}
          getFormatLabel={getFormatLabel}
          getImageFormat={getImageFormat}
        />
      ))}
    </Masonry>
  );
}
