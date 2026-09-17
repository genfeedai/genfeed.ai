import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import AnalyticsOutliers from '@pages/analytics/outliers/analytics-outliers';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Analytics Outliers');

export default function AnalyticsOutliersPage() {
  return (
    <Suspense fallback={null}>
      <AnalyticsOutliers />
    </Suspense>
  );
}
