import { PageScope } from '@genfeedai/contracts';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import ErrorBoundary from '@ui/display/error-boundary/ErrorBoundary';
import { Suspense } from 'react';
import LocalizedActivitiesList from '@/components/activity/LocalizedActivitiesList';

export const generateMetadata = createPageMetadata('Workspace Activity');

/**
 * Workspace Activity is the current brand's IActivity log, not the task
 * queue. Task history stays on Inbox / Overview. The org-wide
 * `~/workspace/activity` route reuses this page; useActivities falls back to
 * organization activities when the URL has no brand.
 */
export default function WorkspaceActivityPage() {
  return (
    <ErrorBoundary>
      <Suspense fallback={null}>
        <LocalizedActivitiesList
          scope={PageScope.BRAND}
          isStatsEnabled
          isFiltersEnabled
        />
      </Suspense>
    </ErrorBoundary>
  );
}
