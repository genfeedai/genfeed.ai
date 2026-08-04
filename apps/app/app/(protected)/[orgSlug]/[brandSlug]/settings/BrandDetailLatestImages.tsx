'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { BrandDetailLatestImagesProps } from '@props/pages/brand-detail.props';
import { EnvironmentService } from '@services/core/environment.service';
import Card from '@ui/card/Card';
import { LazyMasonryImage } from '@ui/lazy/masonry/LazyMasonry';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';

export default function BrandDetailLatestImages({
  images,
}: BrandDetailLatestImagesProps) {
  // One-off generation is Agent-first — Studio no longer has a media prompt bar.
  const createHref = `${EnvironmentService.apps.app}/agent/new`;

  return (
    <Card
      label="Latest Images"
      bodyClassName="gap-3 p-4"
      headerAction={
        <Button
          asChild
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
          withWrapper={false}
        >
          <Link href={`${EnvironmentService.apps.app}/library/overview`}>
            View all
          </Link>
        </Button>
      }
    >
      {images && images.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {images.map((image) => (
            <LazyMasonryImage
              key={image.id}
              image={image}
              isActionsEnabled={false}
              isPublicGallery={false}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-1 px-4 py-8 text-center">
          <p className="text-sm font-medium text-foreground/70">
            No images yet
          </p>
          <p className="max-w-xs text-xs leading-5 text-foreground/45">
            Generate an image for this brand to populate this strip.
          </p>
          <Button
            asChild
            className="mt-2"
            size={ButtonSize.SM}
            variant={ButtonVariant.DEFAULT}
            withWrapper={false}
          >
            <Link href={createHref}>Create an image</Link>
          </Button>
        </div>
      )}
    </Card>
  );
}
