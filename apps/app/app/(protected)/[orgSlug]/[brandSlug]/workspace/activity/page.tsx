import { PageScope } from '@genfeedai/enums';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import ErrorBoundary from '@ui/display/error-boundary/ErrorBoundary';
import { Suspense } from 'react';
import LocalizedActivitiesList from '@/components/activity/LocalizedActivitiesList';

export const generateMetadata = createPageMetadata('Workspace Activity');

/**
 * Workspace Activity shows the org/brand activity log (IActivity), not the
 * task queue. Task history stays on Inbox / Overview; this route matches the
 * "What changed" card and /overview/activities data.
 */
export default function WorkspaceActivityPage() {
  return (
    <ErrorBoundary>
      <Suspense fallback={null}>
        <LocalizedActivitiesList
          scope={PageScope.ORGANIZATION}
          isStatsEnabled
          isFiltersEnabled
        />
      </Suspense>
    </ErrorBoundary>
  );
}
