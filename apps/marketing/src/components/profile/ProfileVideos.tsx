'use client';

import { IngredientStatus } from '@genfeedai/contracts';
import type { IVideo } from '@genfeedai/contracts/interfaces';
import type { ProfileVideosProps } from '@props/content/profile.props';
import Masonry from '@ui/display/masonry/Masonry';
import { LazyMasonryVideo } from '@ui/lazy/masonry/LazyMasonry';
import ProfileMediaCredit from '@web-components/profile/ProfileMediaCredit';

export default function ProfileVideos({
  videos,
  modelCredits = {},
}: ProfileVideosProps) {
  // The public API only returns generated assets. A failed one would render
  // its failure notice, which needs the app's translations; public profiles
  // mount no intl provider, so it is never shown here.
  const visibleVideos = videos.filter(
    (video) => video.status !== IngredientStatus.FAILED,
  );

  if (visibleVideos.length === 0) {
    return null;
  }

  return (
    <div>
      <Masonry columns={{ default: 1, lg: 3, md: 2 }}>
        {visibleVideos.map((video: IVideo) => (
          <div key={video.id}>
            <LazyMasonryVideo
              video={video}
              isActionsEnabled={false}
              isPublicGallery={true}
              isPublicProfile={true}
            />
            <ProfileMediaCredit
              modelKey={video.model}
              modelLabel={video.model ? modelCredits[video.model] : undefined}
            />
          </div>
        ))}
      </Masonry>
    </div>
  );
}
