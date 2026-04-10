'use client';

import type { ModalGalleryItemVideoProps } from '@genfeedai/props/modals/modal-gallery.props';
import MasonryVideo from '@ui/masonry/video/MasonryVideo';

export default function ModalGalleryItemVideo({
  video,
  onSelect,
}: ModalGalleryItemVideoProps) {
  return (
    <div key={video.id} className="relative">
      <MasonryVideo
        video={video}
        isSelected={false}
        isActionsEnabled={false}
        isDragEnabled={false}
        onClickIngredient={() => onSelect(video)}
      />
    </div>
  );
}
