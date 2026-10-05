import AnalyticsBrandDetailRoute from '@app/(protected)/[orgSlug]/[brandSlug]/analytics/brands/[id]/AnalyticsBrandDetailRoute';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Brand Analytics');

export default function AnalyticsBrandDetailPage() {
  return (
    <Suspense fallback={null}>
      <AnalyticsBrandDetailRoute />
    </Suspense>
  );
}
