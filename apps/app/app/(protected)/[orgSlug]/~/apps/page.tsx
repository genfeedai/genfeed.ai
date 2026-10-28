import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import OrganizationAppsPage from './OrganizationAppsPage';

export const generateMetadata = createPageMetadata('Apps');

/**
 * Org-level Apps (#5502). Installation is per organization membership, so the
 * catalog lives at organization scope; the `~/[orgRootApp]` catch-all would 404.
 */
export default function OrganizationAppsRoute() {
  return (
    <Suspense fallback={null}>
      <OrganizationAppsPage />
    </Suspense>
  );
}
