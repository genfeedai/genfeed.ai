import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import OrganizationAutomationOverviewPage from './OrganizationAutomationOverviewPage';

export const generateMetadata = createPageMetadata('Automation Overview');

/**
 * Org-level Automate home. The app switcher sends brandless users here, so this
 * route must exist as a real page — the `~/[orgRootApp]` catch-all would 404.
 */
export default function OrganizationAutomateRoute() {
  return (
    <Suspense fallback={null}>
      <OrganizationAutomationOverviewPage />
    </Suspense>
  );
}
