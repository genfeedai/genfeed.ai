import { EmptyState } from '@ui/primitives/empty-state';
import CommunityCreatorCard from '@web-components/creator/CommunityCreatorCard';
import { createPageMetadataWithCanonical } from '@web-components/og/marketing-metadata';
import { getCommunityCreators } from '../community-loader';
import CommunitySectionLayout from '../community-section-layout';

export const revalidate = 300;

const DESCRIPTION =
  'Creators publishing on Genfeed, each with a public profile of their articles, videos and images at genfeed.ai/@handle.';

export const generateMetadata = createPageMetadataWithCanonical(
  'Creators on Genfeed',
  DESCRIPTION,
  '/community/creators',
);

export default async function CommunityCreatorsPage(): Promise<React.ReactElement> {
  const creators = await getCommunityCreators();

  return (
    <CommunitySectionLayout
      active="creators"
      description={DESCRIPTION}
      title="Creators"
    >
      {creators.length > 0 ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {creators.map((brand) => (
            <li key={brand.id}>
              <CommunityCreatorCard brand={brand} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          description="No public creators yet. Publish your work and your profile appears here."
          surface="card"
          title="Nothing here yet"
        />
      )}
    </CommunitySectionLayout>
  );
}
