import DiscoveryTrendDetailRoute from '@app/(protected)/[orgSlug]/[brandSlug]/discovery/trends/detail/[id]/DiscoveryTrendDetailRoute';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Trend Detail');

export default function DiscoveryTrendDetailPage() {
  return (
    <Suspense fallback={null}>
      <DiscoveryTrendDetailRoute />
    </Suspense>
  );
}
