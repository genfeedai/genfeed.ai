import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import InsightsList from '@pages/insights/list/insights-list';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('AI Insights');

export default function AnalyticsInsightsPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <InsightsList />
    </Suspense>
  );
}
