import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import AnalyticsPlatformDetail from '@pages/analytics/platform-detail/analytics-platform-detail';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Platform Analytics');

export default async function AnalyticsBrandPlatformDetailPage({
  params,
}: {
  params: Promise<{ id: string; platform: string }>;
}) {
  const { id, platform } = await params;

  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <AnalyticsPlatformDetail brandId={id} platform={platform} />
    </Suspense>
  );
}
