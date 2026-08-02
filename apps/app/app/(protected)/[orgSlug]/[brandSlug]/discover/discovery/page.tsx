import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import TrendsList from '@pages/trends/list/trends-list';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Discover');

export default function DiscoverDiscoveryPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <TrendsList />
    </Suspense>
  );
}
