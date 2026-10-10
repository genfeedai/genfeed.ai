import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import OrganizationStorePage from './OrganizationStorePage';

export const generateMetadata = createPageMetadata('Store');

/**
 * Org-level Store (#5502). Installation is per organization membership, so the
 * Store lives at organization scope; the `~/[orgRootApp]` catch-all would 404.
 */
export default function OrganizationStoreRoute() {
  return (
    <Suspense fallback={null}>
      <OrganizationStorePage />
    </Suspense>
  );
}
