'use client';

import {
  ButtonVariant,
  ComponentSize,
  IngredientCategory,
  IngredientFormat,
} from '@genfeedai/enums';
import type { IAsset, IImage, IMusic, IVideo } from '@genfeedai/interfaces';
import type { ModalGalleryContentProps } from '@props/modals/modal-gallery.props';
import { useUploadModal } from '@providers/global-modals/global-modals.provider';
import Button from '@ui/buttons/base/Button';
import Masonry from '@ui/display/masonry/Masonry';
import { SkeletonList } from '@ui/display/skeleton/skeleton';
import Spinner from '@ui/feedback/spinner/Spinner';
import ModalGalleryItemImage from '@ui/modals/gallery/items/ModalGalleryItemImage';
import ModalGalleryItemMusic from '@ui/modals/gallery/items/ModalGalleryItemMusic';
import ModalGalleryItemReference from '@ui/modals/gallery/items/ModalGalleryItemReference';
import ModalGalleryItemVideo from '@ui/modals/gallery/items/ModalGalleryItemVideo';
import { createElement } from 'react';
import {
  HiArrowUpTray,
  HiMusicalNote,
  HiPhoto,
  HiVideoCamera,
} from 'react-icons/hi2';

export default function ModalGalleryContent({
  category,
  activeTab,
  isLoading,
  isLoadingReferences = false,
  isLoadingCreations = false,
  items,
  uploads = [],
  references = [],
  creations = [],
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

    // Upload card component that appears at the start of the grid
    const uploadCard = (
      <Button
        type="button"
        onClick={handleUploadClick}
        variant={ButtonVariant.UNSTYLED}
        className="group relative aspect-square w-full border-2 border-dashed border-foreground/20 hover:border-primary hover:bg-primary/5 transition-all duration-200 flex flex-col items-center justify-center gap-2 cursor-pointer"
        ariaLabel="Upload image"
      >
        <HiArrowUpTray className="w-8 h-8 text-foreground/40 group-hover:text-primary transition-colors" />
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

  // Creations tab content (for images only)
  if (activeTab === 'creations' && category === IngredientCategory.IMAGE) {
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

  // References tab content
  if (activeTab === 'references' && category === IngredientCategory.IMAGE) {
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
