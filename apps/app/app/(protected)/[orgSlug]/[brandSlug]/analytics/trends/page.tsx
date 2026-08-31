import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import AnalyticsTrends from './analytics-trends';

export const generateMetadata = createPageMetadata('Analytics Trends');

export default function AnalyticsTrendsPage() {
  return (
    <Suspense fallback={null}>
      <AnalyticsTrends />
    </Suspense>
  );
}
