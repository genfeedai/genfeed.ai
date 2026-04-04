import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import AnalyticsBrandOverview from '@pages/analytics/brand-overview/analytics-brand-overview';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Brand Analytics');

export default async function AnalyticsBrandDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <AnalyticsBrandOverview brandId={id} />
    </Suspense>
  );
}
