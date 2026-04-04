import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import AutomationOverviewPage from '@pages/agents/overview/AutomationOverviewPage';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Agents Overview');

export default function OrchestrationOverviewRoute() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <AutomationOverviewPage />
    </Suspense>
  );
}
