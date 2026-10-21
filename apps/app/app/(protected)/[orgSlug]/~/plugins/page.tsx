import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import OrganizationPluginsPage from './OrganizationPluginsPage';

export const generateMetadata = createPageMetadata('Plugins');

/**
 * Org-level Plugins (#5502). Installation is per organization membership, so the
 * catalog lives at organization scope; the `~/[orgRootApp]` catch-all would 404.
 */
export default function OrganizationPluginsRoute() {
  return (
    <Suspense fallback={null}>
      <OrganizationPluginsPage />
    </Suspense>
  );
}
