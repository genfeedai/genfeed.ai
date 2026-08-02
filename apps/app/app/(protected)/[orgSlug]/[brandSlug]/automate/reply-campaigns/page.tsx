import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import ErrorBoundary from '@ui/display/error-boundary/ErrorBoundary';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';
import ReplyCampaignsPage from './reply-campaigns-page';

export const generateMetadata = createPageMetadata('Reply Campaigns');

export default function ReplyCampaignsRoute() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
        <ReplyCampaignsPage />
      </Suspense>
    </ErrorBoundary>
  );
}
