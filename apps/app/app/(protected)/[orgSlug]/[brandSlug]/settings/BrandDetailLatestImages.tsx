'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { useFeatureFlag } from '@hooks/feature-flags/use-feature-flag';
import type { BrandDetailLatestImagesProps } from '@props/pages/brand-detail.props';
import { EnvironmentService } from '@services/core/environment.service';
import Card from '@ui/card/Card';
import { LazyMasonryImage } from '@ui/lazy/masonry/LazyMasonry';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';

export default function BrandDetailLatestImages({
  images,
}: BrandDetailLatestImagesProps) {
  const isStudioEnabled = useFeatureFlag('studio');

  return (
    <Card>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Latest Images</h2>
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

      {images && images.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
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
        <Button
          asChild
          className="inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors duration-300 hover:bg-primary/90 sm:h-9"
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
        >
          <Link
            href={`${EnvironmentService.apps.app}${isStudioEnabled ? '/studio/image' : '/agent/new'}`}
          >
            Create an Image
          </Link>
        </Button>
      )}
    </Card>
  );
}
