import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import AgentHubPage from '@pages/agents/agents/AgentHubPage';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Agents Library');

export default function OrchestrationLibraryPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <AgentHubPage />
    </Suspense>
  );
}
