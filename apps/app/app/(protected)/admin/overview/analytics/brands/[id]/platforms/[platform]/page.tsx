import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import AnalyticsPlatformDetail from '@pages/analytics/platform-detail/analytics-platform-detail';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Platform Analytics');

export default async function AdminAnalyticsBrandPlatformDetailPage({
  params,
}: {
  params: Promise<{ id: string; platform: string }>;
}) {
  const { id, platform } = await params;

  return (
    <Suspense fallback={null}>
      <AnalyticsPlatformDetail
        brandId={id}
        platform={platform}
        basePath="/admin/overview/analytics"
      />
    </Suspense>
  );
}
