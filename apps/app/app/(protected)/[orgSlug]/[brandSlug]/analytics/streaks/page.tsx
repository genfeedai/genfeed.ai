import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import StreaksPage from '@pages/streaks/streaks-page';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Streaks');

export default function AnalyticsStreaksPage() {
  return (
    <Suspense fallback={<PageLoadingState />}>
      <StreaksPage />
    </Suspense>
  );
}
