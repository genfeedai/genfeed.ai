import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import ErrorBoundary from '@ui/display/error-boundary/ErrorBoundary';
import { Suspense } from 'react';
import ContentRunListPage from '@/features/content-runs/list/content-run-list';

export const generateMetadata = createPageMetadata('Content Runs');

export default function ContentRunsRoutePage() {
  return (
    <ErrorBoundary>
      <Suspense fallback={null}>
        <ContentRunListPage />
      </Suspense>
    </ErrorBoundary>
  );
}
