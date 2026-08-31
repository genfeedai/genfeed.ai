import PatternLabPage from '@app-components/performance-lab/PatternLabPage';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Performance Lab');

export default function PerformanceLabPage() {
  return (
    <Suspense fallback={null}>
      <PatternLabPage />
    </Suspense>
  );
}
