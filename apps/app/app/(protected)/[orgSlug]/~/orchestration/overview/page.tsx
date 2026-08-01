import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';
import OrganizationAutomationOverviewPage from '../OrganizationAutomationOverviewPage';

export const generateMetadata = createPageMetadata('Automate Overview');

/**
 * Org-level Automate home at the complete `/orchestration/overview` path.
 * Bare `~/orchestration` permanently redirects here via next.config.
 */
export default function OrganizationOrchestrationOverviewRoute() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <OrganizationAutomationOverviewPage />
    </Suspense>
  );
}
