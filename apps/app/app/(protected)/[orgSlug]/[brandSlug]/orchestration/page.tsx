import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';
import AutomationOverviewPage from './overview/AutomationOverviewPage';

export const generateMetadata = createPageMetadata('Agents Overview');

/**
 * Automate app home lives at `/orchestration`.
 * Legacy `/orchestration/overview` permanently redirects here via next.config.
 */
export default function OrchestrationHomeRoute() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <AutomationOverviewPage />
    </Suspense>
  );
}
