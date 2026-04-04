import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import AgentWizardPage from '@pages/agents/agents/new/AgentWizardPage';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('New Agent');

export default function OrchestrationWizardRoute() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <AgentWizardPage />
    </Suspense>
  );
}
