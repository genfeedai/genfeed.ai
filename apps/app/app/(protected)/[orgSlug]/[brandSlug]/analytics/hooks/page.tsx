import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';
import AnalyticsHooks from './analytics-hooks';

export const generateMetadata = createPageMetadata('Hook Performance');

export default function AnalyticsHooksPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <AnalyticsHooks />
    </Suspense>
  );
}
