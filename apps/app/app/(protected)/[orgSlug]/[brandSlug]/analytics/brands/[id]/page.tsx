import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import AnalyticsBrandOverview from '@pages/analytics/brand-overview/analytics-brand-overview';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Brand Analytics');

export default async function AnalyticsBrandDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <Suspense fallback={<PageLoadingState />}>
      <AnalyticsBrandOverview brandId={id} />
    </Suspense>
  );
}
