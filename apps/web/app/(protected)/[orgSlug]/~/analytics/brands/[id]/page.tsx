import OrgAnalyticsBrandDetailRoute from '@app/(protected)/[orgSlug]/~/analytics/brands/[id]/OrgAnalyticsBrandDetailRoute';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Brand Analytics');

export default function OrgAnalyticsBrandDetailPage() {
  return (
    <Suspense fallback={null}>
      <OrgAnalyticsBrandDetailRoute />
    </Suspense>
  );
}
