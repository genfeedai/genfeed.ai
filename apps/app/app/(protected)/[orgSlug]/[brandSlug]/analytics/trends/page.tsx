import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';
import AnalyticsTrends from './analytics-trends';

export const generateMetadata = createPageMetadata('Analytics Trends');

export default function AnalyticsTrendsPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <AnalyticsTrends />
    </Suspense>
  );
}
