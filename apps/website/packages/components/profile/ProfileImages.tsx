'use client';

import { IngredientStatus } from '@genfeedai/contracts';
import type { IImage } from '@genfeedai/contracts/interfaces';
import type { ProfileImagesProps } from '@props/content/profile.props';
import Masonry from '@ui/display/masonry/Masonry';
import { LazyMasonryImage } from '@ui/lazy/masonry/LazyMasonry';

export default function ProfileImages({ images }: ProfileImagesProps) {
  // The public API only returns generated assets. A failed one would render
  // its failure notice, which needs the app's translations; public profiles
  // mount no intl provider, so it is never shown here.
  const visibleImages = images.filter(
    (image) => image.status !== IngredientStatus.FAILED,
  );

  if (visibleImages.length === 0) {
    return null;
  }

  return (
    <div>
      <Masonry columns={{ default: 1 }}>
        {visibleImages.map((image: IImage) => (
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
