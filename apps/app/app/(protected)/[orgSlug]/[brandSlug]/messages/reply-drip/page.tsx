import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import ErrorBoundary from '@ui/display/error-boundary/ErrorBoundary';
import { Suspense } from 'react';
import ReplyDripPage from './reply-drip-page';

export const generateMetadata = createPageMetadata('Reply drip');

export default function ReplyDripRoute() {
  return (
    <ErrorBoundary>
      <Suspense fallback={null}>
        <ReplyDripPage />
      </Suspense>
    </ErrorBoundary>
  );
}
