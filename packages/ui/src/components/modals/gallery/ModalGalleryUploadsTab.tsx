'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type { ModalGalleryUploadsTabProps } from '@genfeedai/props/modals/modal-gallery.props';
import CollectionGrid from '@ui/collection/CollectionGrid';
import { SkeletonList } from '@ui/display/skeleton/skeleton';
import ModalGalleryItemImage from '@ui/modals/gallery/items/ModalGalleryItemImage';
import { Button } from '@ui/primitives/button';
import { Upload } from 'lucide-react';

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

  const uploadCard = (
    <Button
      type="button"
      onClick={onUploadClick}
      variant={ButtonVariant.UNSTYLED}
      className="group relative aspect-square w-full border-2 border-dashed border-foreground/20 hover:border-primary hover:bg-primary/5 transition-[border-color,background-color] duration-200 flex flex-col items-center justify-center gap-2 cursor-pointer"
      ariaLabel="Upload image"
    >
      <Upload className="size-8 text-foreground/40 group-hover:text-primary transition-colors" />
      <span className="text-sm text-foreground/60 group-hover:text-primary transition-colors">
        Upload
      </span>
    </Button>
  );

  return (
    <CollectionGrid maxColumns={3}>
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
    </CollectionGrid>
  );
}
