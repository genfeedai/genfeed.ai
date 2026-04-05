import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import TrendsList from '@pages/trends/list/trends-list';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Research Discovery');

export default function ResearchDiscoveryPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <TrendsList />
    </Suspense>
  );
}
