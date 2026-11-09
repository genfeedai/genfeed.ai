'use client';

import {
  mediaBrandId,
  mediaModelKey,
  publicMediaUrl,
} from '@data/public-media';
import { IngredientStatus } from '@genfeedai/contracts';
import type { IImage } from '@genfeedai/contracts/interfaces';
import type { ProfileImagesProps } from '@props/content/profile.props';
import Masonry from '@ui/display/masonry/Masonry';
import { LazyMasonryImage } from '@ui/lazy/masonry/LazyMasonry';
import ProfileMediaCredit from '@web-components/profile/ProfileMediaCredit';
import { useGalleryViews } from '@web-hooks/ui/use-gallery-views';

export default function ProfileImages({
  creators = {},
  images,
  modelCredits = {},
}: ProfileImagesProps) {
  const { counts, observe } = useGalleryViews();
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
      <Masonry columns={{ default: 1, lg: 3, md: 2 }}>
        {visibleImages.map((image: IImage) => {
          const modelKey = mediaModelKey(image);
          const brandId = mediaBrandId(image);
          return (
            <div data-gallery-id={image.id} key={image.id} ref={observe}>
              <LazyMasonryImage
                image={image}
                isActionsEnabled={false}
                isPublicGallery={true}
                isPublicProfile={true}
              />
              <ProfileMediaCredit
                creatorHandle={brandId ? creators[brandId] : undefined}
                kind="image"
                mediaId={image.id}
                mediaUrl={publicMediaUrl(image)}
                modelKey={modelKey}
                modelLabel={modelKey ? modelCredits[modelKey] : undefined}
                viewCount={counts[image.id] ?? image.viewCount}
              />
            </div>
          );
        })}
      </Masonry>
    </div>
  );
}
