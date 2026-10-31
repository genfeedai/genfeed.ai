import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import OutliersContent from '@/features/analytics/outliers/outliers-content';

export const generateMetadata = createPageMetadata('Analytics Outliers');

export default function AnalyticsOutliersPage() {
  return (
    <Suspense fallback={null}>
      <OutliersContent />
    </Suspense>
  );
}
