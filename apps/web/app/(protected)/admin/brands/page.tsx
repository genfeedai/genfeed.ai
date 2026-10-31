import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import AnalyticsBrandsList from '@/features/analytics/brands-list/analytics-brands-list';

export const generateMetadata = createPageMetadata('Brands Analytics');

export default function BrandsAnalyticsPage() {
  return (
    <Suspense fallback={null}>
      <AnalyticsBrandsList
        basePath={APP_ROUTES.ADMIN.ROOT}
        isBrandScoped={false}
      />
    </Suspense>
  );
}
