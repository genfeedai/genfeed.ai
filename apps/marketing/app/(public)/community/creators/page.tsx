import type { CommunityCreatorsRouteProps } from '@props/content/creator.props';
import Pagination from '@ui/navigation/pagination/Pagination';
import { EmptyState } from '@ui/primitives/empty-state';
import CommunityCreatorCard from '@web-components/creator/CommunityCreatorCard';
import { createPageMetadataWithCanonical } from '@web-components/og/marketing-metadata';
import { getCommunityCreatorsPage } from '../community-loader';
import CommunitySectionLayout from '../community-section-layout';

// Reads `?sort`/`?page`, so it renders on every visit from the API's cache.
export const dynamic = 'force-dynamic';

const DESCRIPTION =
  'Creators publishing on Genfeed, each with a public profile of their articles, videos and images at genfeed.ai/@handle.';

export const generateMetadata = createPageMetadataWithCanonical(
  'Creators on Genfeed',
  DESCRIPTION,
  '/community/creators',
);

/** `?page=3` reads page 3; anything else reads the first page. */
function resolveCreatorsPage(rawPage: string | string[] | undefined): number {
  const value = Array.isArray(rawPage) ? rawPage[0] : rawPage;
  const page = Number.parseInt(value ?? '1', 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

export default async function CommunityCreatorsPage({
  searchParams,
}: CommunityCreatorsRouteProps): Promise<React.ReactElement> {
  const { page: rawPage } = await searchParams;
  const creators = await getCommunityCreatorsPage(resolveCreatorsPage(rawPage));

  return (
    <CommunitySectionLayout
      active="creators"
      description={DESCRIPTION}
      title="Creators"
    >
      {creators.items.length > 0 ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {creators.items.map((brand) => (
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
      {/* Keyed on the API's total, so a page past the end still links back. */}
      {creators.total > 0 ? (
        <div className="mt-8">
          <Pagination
            currentPage={creators.page}
            totalItems={creators.total}
            totalLabel="creators"
            totalPages={creators.totalPages}
          />
        </div>
      ) : null}
    </CommunitySectionLayout>
  );
}
