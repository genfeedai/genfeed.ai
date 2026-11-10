import { buildModelCredits } from '@data/model-credits';
import { parsePublicMediaSort } from '@genfeedai/contracts/constants';
import type { CommunityGalleryRouteProps } from '@props/content/creator.props';
import { getPublicModels } from '@public/models/models-loader';
import { EmptyState } from '@ui/primitives/empty-state';
import CommunitySortMenu from '@web-components/creator/CommunitySortMenu';
import { createPageMetadataWithCanonical } from '@web-components/og/marketing-metadata';
import ProfileImages from '@web-components/profile/ProfileImages';
import '@styles/masonry.css';
import { getCommunityMedia } from '../community-loader';
import CommunitySectionLayout from '../community-section-layout';

export const revalidate = 300;

const DESCRIPTION =
  'The newest images creators made with Genfeed, from public profiles, with the model behind each one.';

export const generateMetadata = createPageMetadataWithCanonical(
  'Images made with Genfeed',
  DESCRIPTION,
  '/community/images',
);

export default async function CommunityImagesPage({
  searchParams,
}: CommunityGalleryRouteProps): Promise<React.ReactElement> {
  const { sort: sortParam } = await searchParams;
  const sort = parsePublicMediaSort(
    Array.isArray(sortParam) ? sortParam[0] : sortParam,
  );
  const [{ creatorHandles, images }, catalog] = await Promise.all([
    getCommunityMedia(sort),
    getPublicModels(),
  ]);

  return (
    <CommunitySectionLayout
      actions={<CommunitySortMenu active={sort} basePath="/community/images" />}
      active="images"
      description={DESCRIPTION}
      title="Images"
    >
      {images.length > 0 ? (
        <ProfileImages
          creators={creatorHandles}
          modelCredits={buildModelCredits(catalog, images)}
          images={images}
        />
      ) : (
        <EmptyState
          description="No public images yet. Make yours public in your Library to show them here."
          surface="card"
          title="Nothing here yet"
        />
      )}
    </CommunitySectionLayout>
  );
}
