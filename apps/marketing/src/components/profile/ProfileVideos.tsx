'use client';

import {
  mediaBrandId,
  mediaDurationSeconds,
  mediaModelKey,
  publicMediaUrl,
} from '@data/public-media';
import { IngredientStatus } from '@genfeedai/contracts';
import type { IVideo } from '@genfeedai/contracts/interfaces';
import type { ProfileVideosProps } from '@props/content/profile.props';
import Masonry from '@ui/display/masonry/Masonry';
import { LazyMasonryVideo } from '@ui/lazy/masonry/LazyMasonry';
import ProfileMediaCredit from '@web-components/profile/ProfileMediaCredit';
import { useGalleryViews } from '@web-hooks/ui/use-gallery-views';

export default function ProfileVideos({
  creators = {},
  videos,
  modelCredits = {},
}: ProfileVideosProps) {
  const { counts, observe } = useGalleryViews();
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
        {visibleVideos.map((video: IVideo) => {
          const modelKey = mediaModelKey(video);
          const brandId = mediaBrandId(video);
          return (
            <div data-gallery-id={video.id} key={video.id} ref={observe}>
              <LazyMasonryVideo
                video={video}
                isActionsEnabled={false}
                isPublicGallery={true}
                isPublicProfile={true}
              />
              <ProfileMediaCredit
                creatorHandle={brandId ? creators[brandId] : undefined}
                durationSeconds={mediaDurationSeconds(video)}
                kind="video"
                mediaId={video.id}
                mediaUrl={publicMediaUrl(video)}
                modelKey={modelKey}
                modelLabel={modelKey ? modelCredits[modelKey] : undefined}
                viewCount={counts[video.id] ?? video.viewCount}
              />
            </div>
          );
        })}
      </Masonry>
    </div>
  );
}
