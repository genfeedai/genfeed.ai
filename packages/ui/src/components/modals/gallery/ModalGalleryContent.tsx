'use client';

import { useUploadModal } from '@genfeedai/contexts/providers/global-modals/global-modals.provider';
import { IngredientCategory, IngredientFormat } from '@genfeedai/enums';
import type { IImage, IMusic, IVideo } from '@genfeedai/interfaces';
import type { ModalGalleryContentProps } from '@genfeedai/props/modals/modal-gallery.props';
import Masonry from '@ui/display/masonry/Masonry';
import { SkeletonList } from '@ui/display/skeleton/skeleton';
import ModalGalleryItemImage from '@ui/modals/gallery/items/ModalGalleryItemImage';
import ModalGalleryItemMusic from '@ui/modals/gallery/items/ModalGalleryItemMusic';
import ModalGalleryItemVideo from '@ui/modals/gallery/items/ModalGalleryItemVideo';
import ModalGalleryCreationsTab from '@ui/modals/gallery/ModalGalleryCreationsTab';
import ModalGalleryReferencesTab from '@ui/modals/gallery/ModalGalleryReferencesTab';
import ModalGalleryUploadsTab from '@ui/modals/gallery/ModalGalleryUploadsTab';
import { createElement } from 'react';
import { HiMusicalNote, HiPhoto, HiVideoCamera } from 'react-icons/hi2';

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
  playingId,
  localFormat,
  onSelectItem,
  onSelectReference,
  onSelectionLimit,
  selectionLimit,
  getFormatLabel,
  getImageFormat,
  onMusicPlayPause,
}: ModalGalleryContentProps) {
  const { openUpload } = useUploadModal({
    onConfirm: () => {
      // Refresh gallery after upload
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
      ? HiVideoCamera
      : category === IngredientCategory.MUSIC
        ? HiMusicalNote
        : HiPhoto;

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
      <div className="text-center py-12">
        {createElement(emptyIcon, {
          className: 'text-5xl text-foreground/20 mx-auto mb-3',
        })}

        <p className="text-foreground/60">{emptyMessage}</p>
        <p className="text-sm text-foreground/40 mt-2">
          Generate some{' '}
          {category === IngredientCategory.VIDEO
            ? 'videos'
            : category === IngredientCategory.MUSIC
              ? 'music'
              : 'images'}{' '}
          first
        </p>
      </div>
    );
  }

  if (category === IngredientCategory.VIDEO) {
    return (
      <Masonry
        key={localFormat}
        gap={4}
        className="w-full"
        columns={{
          default: 3,
          lg: 6,
          md: 5,
          sm: 4,
        }}
      >
        {items.map((item) => (
          <ModalGalleryItemVideo
            key={item.id}
            video={item as IVideo}
            onSelect={onSelectItem}
          />
        ))}
      </Masonry>
    );
  }

  if (category === IngredientCategory.MUSIC) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map((item) => (
          <ModalGalleryItemMusic
            key={item.id}
            music={item as IMusic}
            isSelected={selectedItem === item.id}
            isPlaying={playingId === item.id}
            onSelect={onSelectItem}
            onPlayPause={onMusicPlayPause}
          />
        ))}
      </div>
    );
  }

  // Images
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
    <Masonry key={localFormat} gap={4} className="w-full" columns={columns}>
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
    </Masonry>
  );
}
