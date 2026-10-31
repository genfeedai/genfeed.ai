import OutliersContent from '@app-components/analytics/outliers-content';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Analytics Outliers');

export default function AnalyticsOutliersPage() {
  return (
    <Suspense fallback={null}>
      <OutliersContent />
    </Suspense>
  );
}
