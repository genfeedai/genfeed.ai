import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import ErrorBoundary from '@ui/display/error-boundary/ErrorBoundary';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';
import AuthorRepliesPage from './author-replies-page';

export const generateMetadata = createPageMetadata('Author Replies');

export default function AuthorRepliesRoute() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
        <AuthorRepliesPage />
      </Suspense>
    </ErrorBoundary>
  );
}
