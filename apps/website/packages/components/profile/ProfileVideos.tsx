'use client';

import type { IVideo } from '@genfeedai/interfaces';
import type { ProfileVideosProps } from '@props/content/profile.props';
import Masonry from '@ui/display/masonry/Masonry';
import { LazyMasonryVideo } from '@ui/lazy/masonry/LazyMasonry';

export default function ProfileVideos({ videos }: ProfileVideosProps) {
  if (videos.length === 0) {
    return null;
  }

  return (
    <div>
      <Masonry columns={{ default: 1 }}>
        {videos.map((video: IVideo) => (
          <LazyMasonryVideo
            key={video.id}
            video={video}
            isActionsEnabled={false}
            isPublicGallery={true}
            isPublicProfile={true}
          />
        ))}
      </Masonry>
    </div>
  );
}
