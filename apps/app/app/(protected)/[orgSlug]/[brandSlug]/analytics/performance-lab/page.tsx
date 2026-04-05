import PatternLabPage from '@app-components/performance-lab/PatternLabPage';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Performance Lab');

export default function PerformanceLabPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <PatternLabPage />
    </Suspense>
  );
}
