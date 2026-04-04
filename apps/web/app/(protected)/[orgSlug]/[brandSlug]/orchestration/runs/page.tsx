import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import MissionControl from '@pages/mission-control/mission-control';
import ErrorBoundary from '@ui/display/error-boundary/ErrorBoundary';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Agent Runs');

export default function OrchestrationRunsPage() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
        <MissionControl />
      </Suspense>
    </ErrorBoundary>
  );
}
