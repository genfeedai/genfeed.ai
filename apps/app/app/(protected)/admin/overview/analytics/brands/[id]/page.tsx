import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import AnalyticsBrandOverview from '@pages/analytics/brand-overview/analytics-brand-overview';
import type { AnalyticsDetailPageProps } from '@props/admin/analytics.props';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Brand Analytics');

export default async function BrandDetailPage({
  params,
}: AnalyticsDetailPageProps) {
  const { id } = await params;

  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <AnalyticsBrandOverview brandId={id} />
    </Suspense>
  );
}
