'use client';

import { useUploadModal } from '@genfeedai/contexts/providers/global-modals/global-modals.hooks';
import { IngredientCategory } from '@genfeedai/contracts';
import type { IImage, IMusic, IVideo } from '@genfeedai/contracts/interfaces';
import type { ModalGalleryContentProps } from '@genfeedai/props/modals/modal-gallery.props';
import { CardEmptyContent } from '@ui/card/empty/CardEmpty';
import CollectionGrid from '@ui/collection/CollectionGrid';
import { SkeletonList } from '@ui/display/skeleton/skeleton';
import { Image, Music, Video } from 'lucide-react';
import ModalGalleryItemImage from '@/components/modals/gallery/items/ModalGalleryItemImage';
import ModalGalleryItemMusic from '@/components/modals/gallery/items/ModalGalleryItemMusic';
import ModalGalleryItemVideo from '@/components/modals/gallery/items/ModalGalleryItemVideo';
import ModalGalleryCreationsTab from '@/components/modals/gallery/ModalGalleryCreationsTab';
import ModalGalleryReferencesTab from '@/components/modals/gallery/ModalGalleryReferencesTab';
import ModalGalleryUploadsTab from '@/components/modals/gallery/ModalGalleryUploadsTab';

const EMPTY_ARRAY: never[] = [];

export default function ModalGalleryContent({
  category,
  activeTab,
  isLoading,
  isLoadingReferences = false,
  isLoadingCreations = false,
  items,
  uploads = EMPTY_ARRAY,
  references = EMPTY_ARRAY,
  creations = EMPTY_ARRAY,
  selectedItems,
  selectedItem,
  localFormat,
  onSelectItem,
  onSelectReference,
  onSelectionLimit,
  selectionLimit,
  getFormatLabel,
  getImageFormat,
}: ModalGalleryContentProps) {
  const { openUpload } = useUploadModal({
    onComplete: () => {
      window.location.reload();
    },
  });

  const handleUploadClick = () => {
    openUpload({
      category: IngredientCategory.IMAGE,
    });
  };

  const emptyIcon =
    category === IngredientCategory.VIDEO
      ? Video
      : category === IngredientCategory.MUSIC
        ? Music
        : Image;

  const emptyMessage =
    category === IngredientCategory.VIDEO
      ? `No ${localFormat} videos available`
      : category === IngredientCategory.MUSIC
        ? 'No music tracks available'
        : `No ${localFormat} images available`;

  // Uploads tab content (for images only)
  if (activeTab === 'uploads' && category === IngredientCategory.IMAGE) {
    return (
      <ModalGalleryUploadsTab
        uploads={uploads as IImage[]}
        isLoading={isLoading}
        localFormat={localFormat}
        selectedItems={selectedItems}
        onSelectItem={onSelectItem as (item: IImage) => void}
        getFormatLabel={getFormatLabel}
        getImageFormat={getImageFormat}
        onUploadClick={handleUploadClick}
      />
    );
  }

  // Creations tab content (for images only)
  if (activeTab === 'creations' && category === IngredientCategory.IMAGE) {
    return (
      <ModalGalleryCreationsTab
        creations={creations as IImage[]}
        isLoadingCreations={isLoadingCreations}
        localFormat={localFormat}
        selectedItems={selectedItems}
        onSelectItem={onSelectItem as (item: IImage) => void}
        getFormatLabel={getFormatLabel}
        getImageFormat={getImageFormat}
      />
    );
  }

  // References tab content
  if (activeTab === 'references' && category === IngredientCategory.IMAGE) {
    return (
      <ModalGalleryReferencesTab
        references={references}
        isLoadingReferences={isLoadingReferences}
        selectedItems={selectedItems}
        onSelectReference={onSelectReference}
        onSelectionLimit={onSelectionLimit}
        selectionLimit={selectionLimit}
      />
    );
  }

  // Media tab content
  if (isLoading) {
    return <SkeletonList count={12} />;
  }

  if (items.length === 0) {
    return (
      <CardEmptyContent
        icon={emptyIcon}
        label={emptyMessage}
        description={`Generate some ${
          category === IngredientCategory.VIDEO
            ? 'videos'
            : category === IngredientCategory.MUSIC
              ? 'music'
              : 'images'
        } first`}
      />
    );
  }

  if (category === IngredientCategory.VIDEO) {
    return (
      <CollectionGrid maxColumns={3}>
        {items.map((item) => (
          <ModalGalleryItemVideo
            key={item.id}
            video={item as IVideo}
            onSelect={onSelectItem}
          />
        ))}
      </CollectionGrid>
    );
  }

  if (category === IngredientCategory.MUSIC) {
    return (
      <CollectionGrid maxColumns={3}>
        {items.map((item) => (
          <ModalGalleryItemMusic
            key={item.id}
            music={item as IMusic}
            isSelected={selectedItem === item.id}
            onSelect={onSelectItem}
          />
        ))}
      </CollectionGrid>
    );
  }

  return (
    <CollectionGrid maxColumns={3}>
      {items.map((item) => (
        <ModalGalleryItemImage
          key={item.id}
          image={item as IImage}
          isSelected={selectedItems.includes(item.id)}
          localFormat={localFormat}
          onSelect={onSelectItem}
          getFormatLabel={getFormatLabel}
          getImageFormat={getImageFormat}
        />
      ))}
    </CollectionGrid>
  );
}
