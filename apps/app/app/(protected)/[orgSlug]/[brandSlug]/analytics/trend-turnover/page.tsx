import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';
import AnalyticsTrendTurnover from './analytics-trend-turnover';

export const generateMetadata = createPageMetadata('Trend Turnover Dashboard');

export default function TrendTurnoverPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <AnalyticsTrendTurnover />
    </Suspense>
  );
}
