import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import PatternLabPage from '@/features/analytics/performance-lab/PatternLabPage';

export const generateMetadata = createPageMetadata('Performance Lab');

export default function PerformanceLabPage() {
  return (
    <Suspense fallback={null}>
      <PatternLabPage />
    </Suspense>
  );
}
