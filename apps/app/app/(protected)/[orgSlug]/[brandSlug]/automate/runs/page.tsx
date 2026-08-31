import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import ErrorBoundary from '@ui/display/error-boundary/ErrorBoundary';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';
import MissionControl from './mission-control';

export const generateMetadata = createPageMetadata('Agent Runs');

export default function AutomateRunsPage() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageLoadingState />}>
        <MissionControl />
      </Suspense>
    </ErrorBoundary>
  );
}
