import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { BrandDetailLatestImagesProps } from '@props/pages/brand-detail.props';
import { EnvironmentService } from '@services/core/environment.service';
import { LazyMasonryImage } from '@ui/lazy/masonry/LazyMasonry';
import BrandDetailLatestContentCard from './BrandDetailLatestContentCard';

export default function BrandDetailLatestImages({
  images,
}: BrandDetailLatestImagesProps) {
  const { href } = useOrgUrl();
  // One-off generation is Agent-first — Studio no longer has a media prompt bar.
  const createHref = `${EnvironmentService.apps.app}${href(APP_ROUTES.AGENT.NEW)}`;

  return (
    <BrandDetailLatestContentCard
      label="Latest Images"
      viewAllHref={`${EnvironmentService.apps.app}${href(APP_ROUTES.LIBRARY.ASSETS)}`}
      emptyTitle="No images yet"
      emptyDescription="Generate an image for this brand to populate this strip."
      createLabel="Create an image"
      createHref={createHref}
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
      ) : null}
    </BrandDetailLatestContentCard>
  );
}
