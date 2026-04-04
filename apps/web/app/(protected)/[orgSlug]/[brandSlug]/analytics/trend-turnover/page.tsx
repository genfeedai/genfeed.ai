import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import AnalyticsTrendTurnover from '@pages/analytics/trend-turnover/analytics-trend-turnover';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Trend Turnover Dashboard');

export default function TrendTurnoverPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <AnalyticsTrendTurnover />
    </Suspense>
  );
}
