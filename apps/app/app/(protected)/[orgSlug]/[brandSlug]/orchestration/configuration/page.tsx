import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import AgentConfigurationPage from '@pages/agents/configuration/agent-configuration-page';
import ErrorBoundary from '@ui/display/error-boundary/ErrorBoundary';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Agent Configuration');

export default function ConfigurationPage() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
        <AgentConfigurationPage />
      </Suspense>
    </ErrorBoundary>
  );
}
