import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import ErrorBoundary from '@ui/display/error-boundary/ErrorBoundary';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';
import RepliesPage from './replies-page';

export const generateMetadata = createPageMetadata('Replies');

export default function RepliesRoute() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
        <RepliesPage />
      </Suspense>
    </ErrorBoundary>
  );
}
