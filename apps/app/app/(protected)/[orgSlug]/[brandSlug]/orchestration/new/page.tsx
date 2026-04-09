import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';
import AgentWizardPage from './AgentWizardPage';

export const generateMetadata = createPageMetadata('New Agent');

export default function OrchestrationWizardRoute() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <AgentWizardPage />
    </Suspense>
  );
}
