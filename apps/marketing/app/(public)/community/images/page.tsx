import { buildModelCredits } from '@data/model-credits';
import { getPublicModels } from '@public/models/models-loader';
import { EmptyState } from '@ui/primitives/empty-state';
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

export default async function CommunityImagesPage(): Promise<React.ReactElement> {
  const [{ images }, catalog] = await Promise.all([
    getCommunityMedia(),
    getPublicModels(),
  ]);

  return (
    <CommunitySectionLayout
      active="images"
      description={DESCRIPTION}
      title="Images"
    >
      {images.length > 0 ? (
        <ProfileImages
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
