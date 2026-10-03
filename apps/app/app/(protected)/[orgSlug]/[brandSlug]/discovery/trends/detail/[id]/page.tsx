import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import TrendDetail from '@pages/trends/detail/trend-detail';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Trend Detail');

export default async function DiscoveryTrendDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <Suspense fallback={null}>
      <TrendDetail trendId={id} backHref="/discovery/trends" />
    </Suspense>
  );
}
