import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';
import AgentStrategiesPage from './agent-strategies-page';

export const generateMetadata = createPageMetadata('Autopilot');

export default function AutopilotPage() {
  return (
    <Suspense fallback={<PageLoadingState />}>
      <AgentStrategiesPage />
    </Suspense>
  );
}
