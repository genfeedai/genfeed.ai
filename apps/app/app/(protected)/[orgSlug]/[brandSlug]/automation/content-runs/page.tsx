import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import ContentRunListPage from '@pages/content-runs/list/content-run-list';
import ErrorBoundary from '@ui/display/error-boundary/ErrorBoundary';
import { Suspense } from 'react';

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
