import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';
import InsightsOverview from './insights-overview';

export const generateMetadata = createPageMetadata('AI Insights');

export default function AnalyticsInsightsPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <InsightsOverview />
    </Suspense>
  );
}
