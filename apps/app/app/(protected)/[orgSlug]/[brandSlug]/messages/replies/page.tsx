import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import ErrorBoundary from '@ui/display/error-boundary/ErrorBoundary';
import { Suspense } from 'react';
import RepliesFeatureGate from './replies-feature-gate';
import RepliesPage from './replies-page';

export const generateMetadata = createPageMetadata('Replies');

export default function RepliesRoute() {
  return (
    <RepliesFeatureGate>
      <ErrorBoundary>
        <Suspense fallback={null}>
          <RepliesPage />
        </Suspense>
      </ErrorBoundary>
    </RepliesFeatureGate>
  );
}
