import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import OrganizationExplorePage from './OrganizationExplorePage';

export const generateMetadata = createPageMetadata('Explore');

/**
 * Org-level Explore (#5502). Installation is per organization membership, so the
 * Store lives at organization scope; the `~/[orgRootApp]` catch-all would 404.
 */
export default function OrganizationExploreRoute() {
  return (
    <Suspense fallback={null}>
      <OrganizationExplorePage />
    </Suspense>
  );
}
