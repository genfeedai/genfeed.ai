import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import StreaksPage from '@pages/streaks/streaks-page';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Streaks');

export default function AnalyticsStreaksPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <StreaksPage />
    </Suspense>
  );
}
