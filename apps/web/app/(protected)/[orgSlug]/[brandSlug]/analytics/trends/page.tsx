import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import AnalyticsTrends from '@pages/analytics/trends/analytics-trends';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Analytics Trends');

export default function AnalyticsTrendsPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <AnalyticsTrends />
    </Suspense>
  );
}
