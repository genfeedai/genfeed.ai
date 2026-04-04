import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import AgentStrategiesPage from '@pages/agents/strategies/agent-strategies-page';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Autopilot');

export default function AutopilotPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <AgentStrategiesPage />
    </Suspense>
  );
}
