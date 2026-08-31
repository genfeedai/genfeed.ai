import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import AnalyticsPlatformDetail from '@pages/analytics/platform-detail/analytics-platform-detail';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Platform Analytics');

export default async function AnalyticsBrandPlatformDetailPage({
  params,
}: {
  params: Promise<{ id: string; platform: string }>;
}) {
  const { id, platform } = await params;

  return (
    <Suspense fallback={<PageLoadingState />}>
      <AnalyticsPlatformDetail brandId={id} platform={platform} />
    </Suspense>
  );
}
