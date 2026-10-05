import AdminAnalyticsBrandPlatformDetailRoute from '@app/(protected)/admin/overview/analytics/brands/[id]/platforms/[platform]/AdminAnalyticsBrandPlatformDetailRoute';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Platform Analytics');

export default function AdminAnalyticsBrandPlatformDetailPage() {
  return (
    <Suspense fallback={null}>
      <AdminAnalyticsBrandPlatformDetailRoute />
    </Suspense>
  );
}
