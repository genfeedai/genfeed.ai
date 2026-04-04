import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import BotsPage from '@protected/automation/bots/bots-page';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Bots');

export default function BotsPageWrapper() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <BotsPage />
    </Suspense>
  );
}
