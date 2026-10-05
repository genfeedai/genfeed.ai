import ContentRunRoute from '@app/(protected)/[orgSlug]/[brandSlug]/automation/content-runs/[runId]/ContentRunRoute';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import ErrorBoundary from '@ui/display/error-boundary/ErrorBoundary';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Content Run');

export default function ContentRunRoutePage() {
  return (
    <ErrorBoundary>
      <Suspense fallback={null}>
        <ContentRunRoute />
      </Suspense>
    </ErrorBoundary>
  );
}
