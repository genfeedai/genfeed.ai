import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';
import AgentHubPage from './AgentHubPage';

export const generateMetadata = createPageMetadata('Agents Library');

export default function OrchestrationLibraryPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <AgentHubPage />
    </Suspense>
  );
}
