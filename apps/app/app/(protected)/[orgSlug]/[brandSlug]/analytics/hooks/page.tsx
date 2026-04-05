import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import AnalyticsHooks from '@pages/analytics/hooks/analytics-hooks';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Hook Performance');

export default function AnalyticsHooksPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <AnalyticsHooks />
    </Suspense>
  );
}
