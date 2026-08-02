import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';
import AutomationOverviewPage from './overview/AutomationOverviewPage';

export const generateMetadata = createPageMetadata('Agents Overview');

/**
 * Automate app home lives at `/automate`.
 * Legacy `/automate/overview` permanently redirects here via next.config.
 */
export default function AutomateHomeRoute() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <AutomationOverviewPage />
    </Suspense>
  );
}
