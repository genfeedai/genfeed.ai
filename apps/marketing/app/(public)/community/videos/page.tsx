import { buildModelCredits } from '@data/model-credits';
import { parsePublicMediaSort } from '@genfeedai/contracts/constants';
import type { CommunityGalleryRouteProps } from '@props/content/creator.props';
import { getPublicModels } from '@public/models/models-loader';
import { EmptyState } from '@ui/primitives/empty-state';
import CommunitySortMenu from '@web-components/creator/CommunitySortMenu';
import { createPageMetadataWithCanonical } from '@web-components/og/marketing-metadata';
import ProfileVideos from '@web-components/profile/ProfileVideos';
import '@styles/masonry.css';
import { getCommunityMedia } from '../community-loader';
import CommunitySectionLayout from '../community-section-layout';

// Reads `?sort`/`?page`, so it renders on every visit from the API's cache.
export const dynamic = 'force-dynamic';

const DESCRIPTION =
  'The newest videos creators made with Genfeed, from public profiles, with the model behind each one.';

export const generateMetadata = createPageMetadataWithCanonical(
  'Videos made with Genfeed',
  DESCRIPTION,
  '/community/videos',
);

export default async function CommunityVideosPage({
  searchParams,
}: CommunityGalleryRouteProps): Promise<React.ReactElement> {
  const { sort: sortParam } = await searchParams;
  const sort = parsePublicMediaSort(
    Array.isArray(sortParam) ? sortParam[0] : sortParam,
  );
  const [{ creatorHandles, videos }, catalog] = await Promise.all([
    getCommunityMedia(sort),
    getPublicModels(),
  ]);

  return (
    <CommunitySectionLayout
      actions={<CommunitySortMenu active={sort} basePath="/community/videos" />}
      active="videos"
      description={DESCRIPTION}
      title="Videos"
    >
      {videos.length > 0 ? (
        <ProfileVideos
          creators={creatorHandles}
          modelCredits={buildModelCredits(catalog, videos)}
          videos={videos}
        />
      ) : (
        <EmptyState
          description="No public videos yet. Make yours public in your Library to show them here."
          surface="card"
          title="Nothing here yet"
        />
      )}
    </CommunitySectionLayout>
  );
}
