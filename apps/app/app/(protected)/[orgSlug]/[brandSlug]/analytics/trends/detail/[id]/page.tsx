import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import TrendDetail from '@pages/analytics/trends/trend-detail/trend-detail';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Trend Detail');

export default async function AnalyticsTrendDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <Suspense fallback={<PageLoadingState />}>
      <TrendDetail trendId={id} backHref="/analytics/trends" />
    </Suspense>
  );
}
