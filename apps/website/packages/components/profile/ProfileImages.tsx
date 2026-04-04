'use client';

import type { IImage } from '@genfeedai/interfaces';
import type { ProfileImagesProps } from '@props/content/profile.props';
import Masonry from '@ui/display/masonry/Masonry';
import { LazyMasonryImage } from '@ui/lazy/masonry/LazyMasonry';

export default function ProfileImages({ images }: ProfileImagesProps) {
  if (images.length === 0) {
    return null;
  }

  return (
    <div>
      <Masonry columns={{ default: 1 }}>
        {images.map((image: IImage) => (
          <LazyMasonryImage
            key={image.id}
            image={image}
            isActionsEnabled={false}
            isPublicGallery={true}
            isPublicProfile={true}
          />
        ))}
      </Masonry>
    </div>
  );
}
