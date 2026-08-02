'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { BrandDetailLatestVideosProps } from '@props/pages/brand-detail.props';
import { EnvironmentService } from '@services/core/environment.service';
import Card from '@ui/card/Card';
import { LazyMasonryVideo } from '@ui/lazy/masonry/LazyMasonry';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';

export default function BrandDetailLatestVideos({
  videos,
}: BrandDetailLatestVideosProps) {
  // One-off generation is Agent-first — Studio no longer has a media prompt bar.
  const createHref = `${EnvironmentService.apps.app}/agent/new`;

  return (
    <Card
      label="Latest Videos"
      bodyClassName="gap-3 p-4"
      headerAction={
        <Button
          asChild
          size={ButtonSize.SM}
          variant={ButtonVariant.GHOST}
          withWrapper={false}
        >
          <Link href={`${EnvironmentService.apps.app}/library/overview`}>
            View all
          </Link>
        </Button>
      }
    >
      {videos && videos.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
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
        <div className="flex flex-col items-center justify-center gap-1 px-4 py-8 text-center">
          <p className="text-sm font-medium text-foreground/70">
            No videos yet
          </p>
          <p className="max-w-xs text-xs leading-5 text-foreground/45">
            Generate a video for this brand to populate this strip.
          </p>
          <Button
            asChild
            className="mt-2 h-8 text-xs"
            size={ButtonSize.SM}
            variant={ButtonVariant.GHOST}
            withWrapper={false}
          >
            <Link href={createHref}>Create a video</Link>
          </Button>
        </div>
      )}
    </Card>
  );
}
