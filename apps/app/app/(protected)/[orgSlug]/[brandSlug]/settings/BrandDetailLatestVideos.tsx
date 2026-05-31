'use client';

import type { BrandDetailLatestVideosProps } from '@props/pages/brand-detail.props';
import { EnvironmentService } from '@services/core/environment.service';
import Card from '@ui/card/Card';
import { LazyMasonryVideo } from '@ui/lazy/masonry/LazyMasonry';
import Link from 'next/link';

export default function BrandDetailLatestVideos({
  videos,
}: BrandDetailLatestVideosProps) {
  return (
    <Card>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Latest Videos</h2>
        <Link
          href={`${EnvironmentService.apps.app}/library/ingredients`}
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-xs font-medium transition-all duration-300 bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80 h-8 px-3"
        >
          View All
        </Link>
      </div>

      {videos && videos.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {videos.map((video) => (
            <LazyMasonryVideo
              key={video.id}
              video={video}
              isActionsEnabled={false}
              isPublicGallery={false}
            />
          ))}
        </div>
      ) : (
        <Link
          href={`${EnvironmentService.apps.app}/studio/video`}
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all duration-300 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2"
        >
          Create a Video
        </Link>
      )}
    </Card>
  );
}
