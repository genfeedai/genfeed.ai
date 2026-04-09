import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import AnalyticsOrganizationsList from './analytics-organizations-list';

export const generateMetadata = createPageMetadata('Organizations Analytics');

export default function OrganizationsAnalyticsPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="table" />}>
      <AnalyticsOrganizationsList basePath="/analytics" />
    </Suspense>
  );
}
