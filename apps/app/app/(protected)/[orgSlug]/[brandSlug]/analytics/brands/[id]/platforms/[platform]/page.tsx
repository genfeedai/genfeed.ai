import AnalyticsBrandPlatformDetailRoute from '@app/(protected)/[orgSlug]/[brandSlug]/analytics/brands/[id]/platforms/[platform]/AnalyticsBrandPlatformDetailRoute';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Platform Analytics');

export default function AnalyticsBrandPlatformDetailPage() {
  return (
    <Suspense fallback={null}>
      <AnalyticsBrandPlatformDetailRoute />
    </Suspense>
  );
}
