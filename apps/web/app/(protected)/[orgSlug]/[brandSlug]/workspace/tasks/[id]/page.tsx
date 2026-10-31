import IssueDetailRoute from '@app/(protected)/[orgSlug]/[brandSlug]/workspace/tasks/[id]/IssueDetailRoute';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import ErrorBoundary from '@ui/display/error-boundary/ErrorBoundary';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Issue');

export default function IssueDetailPage() {
  return (
    <ErrorBoundary>
      <Suspense fallback={null}>
        <IssueDetailRoute />
      </Suspense>
    </ErrorBoundary>
  );
}
