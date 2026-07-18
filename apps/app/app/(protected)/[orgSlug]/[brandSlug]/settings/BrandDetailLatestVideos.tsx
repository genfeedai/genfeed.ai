'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { useFeatureFlag } from '@hooks/feature-flags/use-feature-flag';
import type { BrandDetailLatestVideosProps } from '@props/pages/brand-detail.props';
import { EnvironmentService } from '@services/core/environment.service';
import Card from '@ui/card/Card';
import { LazyMasonryVideo } from '@ui/lazy/masonry/LazyMasonry';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';

export default function BrandDetailLatestVideos({
  videos,
}: BrandDetailLatestVideosProps) {
  const isStudioEnabled = useFeatureFlag('studio');

  return (
    <Card>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Latest Videos</h2>
        <Button
          asChild
          className="inline-flex h-8 items-center justify-center gap-2 whitespace-nowrap bg-secondary px-3 text-xs font-medium text-secondary-foreground shadow-sm transition-colors duration-300 hover:bg-secondary/80"
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
        >
          <Link href={`${EnvironmentService.apps.app}/library/ingredients`}>
            View All
          </Link>
        </Button>
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
        <Button
          asChild
          className="inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors duration-300 hover:bg-primary/90 sm:h-9"
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
        >
          <Link
            href={`${EnvironmentService.apps.app}${isStudioEnabled ? '/studio/video' : '/agent/new'}`}
          >
            Create a Video
          </Link>
        </Button>
      )}
    </Card>
  );
}
