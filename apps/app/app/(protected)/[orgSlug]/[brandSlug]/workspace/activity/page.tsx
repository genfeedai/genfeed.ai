import { PageScope } from '@genfeedai/enums';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import ActivitiesList from '@pages/activities/activities-list';
import ErrorBoundary from '@ui/display/error-boundary/ErrorBoundary';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Workspace Activity');

/**
 * Workspace Activity shows the org/brand activity log (IActivity), not the
 * task queue. Task history stays on Inbox / Overview; this route matches the
 * "What changed" card and /overview/activities data.
 */
export default function WorkspaceActivityPage() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
        <ActivitiesList
          scope={PageScope.ORGANIZATION}
          isStatsEnabled
          isFiltersEnabled
        />
      </Suspense>
    </ErrorBoundary>
  );
}
