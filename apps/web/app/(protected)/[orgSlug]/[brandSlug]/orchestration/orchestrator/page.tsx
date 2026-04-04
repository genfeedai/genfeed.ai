import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import ContentTeamOrchestratorPage from '@pages/agents/content-team/ContentTeamOrchestratorPage';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Launch Orchestrator');

export default function ContentTeamOrchestratorRoute() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <ContentTeamOrchestratorPage />
    </Suspense>
  );
}
