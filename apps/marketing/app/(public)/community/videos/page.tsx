import { buildModelCredits } from '@data/model-credits';
import { getPublicModels } from '@public/models/models-loader';
import { EmptyState } from '@ui/primitives/empty-state';
import { createPageMetadataWithCanonical } from '@web-components/og/marketing-metadata';
import ProfileVideos from '@web-components/profile/ProfileVideos';
import '@styles/masonry.css';
import { getCommunityMedia } from '../community-loader';
import CommunitySectionLayout from '../community-section-layout';

export const revalidate = 300;

const DESCRIPTION =
  'The newest videos creators made with Genfeed, from public profiles, with the model behind each one.';

export const generateMetadata = createPageMetadataWithCanonical(
  'Videos made with Genfeed',
  DESCRIPTION,
  '/community/videos',
);

export default async function CommunityVideosPage(): Promise<React.ReactElement> {
  const [{ videos }, catalog] = await Promise.all([
    getCommunityMedia(),
    getPublicModels(),
  ]);

  return (
    <CommunitySectionLayout
      active="videos"
      description={DESCRIPTION}
      title="Videos"
    >
      {videos.length > 0 ? (
        <ProfileVideos
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
