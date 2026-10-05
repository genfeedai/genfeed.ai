import BrandDetailRoute from '@app/(protected)/admin/overview/analytics/brands/[id]/BrandDetailRoute';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Brand Analytics');

export default function BrandDetailPage() {
  return (
    <Suspense fallback={null}>
      <BrandDetailRoute />
    </Suspense>
  );
}
