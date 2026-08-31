import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import ErrorBoundary from '@ui/display/error-boundary/ErrorBoundary';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';
import ReplyDripPage from './reply-drip-page';

export const generateMetadata = createPageMetadata('Reply drip');

export default function ReplyDripRoute() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageLoadingState />}>
        <ReplyDripPage />
      </Suspense>
    </ErrorBoundary>
  );
}
