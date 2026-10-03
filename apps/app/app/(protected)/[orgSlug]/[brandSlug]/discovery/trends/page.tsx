import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import DiscoveryTrends from './discovery-trends';

export const generateMetadata = createPageMetadata('Trends');

export default function DiscoveryTrendsPage() {
  return (
    <Suspense fallback={null}>
      <DiscoveryTrends />
    </Suspense>
  );
}
