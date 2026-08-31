import { REPLY_BOT_FEATURE_FLAG } from '@genfeedai/constants';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import ErrorBoundary from '@ui/display/error-boundary/ErrorBoundary';
import FeatureGate from '@ui/guards/feature/FeatureGate';
import { Suspense } from 'react';
import RepliesPage from './replies-page';

export const generateMetadata = createPageMetadata('Replies');

export default function RepliesRoute() {
  return (
    <FeatureGate flagKey={REPLY_BOT_FEATURE_FLAG}>
      <ErrorBoundary>
        <Suspense fallback={null}>
          <RepliesPage />
        </Suspense>
      </ErrorBoundary>
    </FeatureGate>
  );
}
