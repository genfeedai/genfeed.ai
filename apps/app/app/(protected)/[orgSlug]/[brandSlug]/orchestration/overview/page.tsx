import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';
import AutomationOverviewPage from './AutomationOverviewPage';

export const generateMetadata = createPageMetadata('Agents Overview');

export default function OrchestrationOverviewRoute() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <AutomationOverviewPage />
    </Suspense>
  );
}
