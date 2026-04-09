import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';
import AgentStrategiesPage from './agent-strategies-page';

export const generateMetadata = createPageMetadata('Autopilot');

export default function AutopilotPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <AgentStrategiesPage />
    </Suspense>
  );
}
