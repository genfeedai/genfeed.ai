import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import AutomationAnalyticsPage from '@pages/agents/analytics/AutomationAnalyticsPage';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Agents Analytics');

export default function OrchestrationAnalyticsRoute() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <AutomationAnalyticsPage />
    </Suspense>
  );
}
