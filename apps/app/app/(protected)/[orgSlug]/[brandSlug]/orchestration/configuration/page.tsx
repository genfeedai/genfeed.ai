import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import ErrorBoundary from '@ui/display/error-boundary/ErrorBoundary';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';
import AgentConfigurationPage from './agent-configuration-page';

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
