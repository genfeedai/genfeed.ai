import WorkspaceInboxRoute from '@app/(protected)/[orgSlug]/[brandSlug]/workspace/inbox/WorkspaceInboxRoute';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import ErrorBoundary from '@ui/display/error-boundary/ErrorBoundary';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Workspace Inbox');

export default function WorkspaceInboxPage() {
  return (
    <ErrorBoundary>
      <Suspense fallback={null}>
        <WorkspaceInboxRoute />
      </Suspense>
    </ErrorBoundary>
  );
}
