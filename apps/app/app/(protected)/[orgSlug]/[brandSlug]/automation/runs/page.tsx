import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import ErrorBoundary from '@ui/display/error-boundary/ErrorBoundary';
import { Suspense } from 'react';
import MissionControl from './mission-control';

export const generateMetadata = createPageMetadata('Agent Runs');

export default function AutomationRunsPage() {
  return (
    <ErrorBoundary>
      <Suspense fallback={null}>
        <MissionControl />
      </Suspense>
    </ErrorBoundary>
  );
}
