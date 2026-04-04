import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import AnalyticsOrganizationsList from '@pages/analytics/organizations-list/analytics-organizations-list';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Organizations Analytics');

export default function OrganizationsAnalyticsPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="table" />}>
      <AnalyticsOrganizationsList basePath="/analytics" />
    </Suspense>
  );
}
