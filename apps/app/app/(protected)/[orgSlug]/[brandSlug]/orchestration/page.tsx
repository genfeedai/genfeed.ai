import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';
import ContentTeamPage from './ContentTeamPage';

export const generateMetadata = createPageMetadata('Content Team');

export default function ContentTeamRoute() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <ContentTeamPage />
    </Suspense>
  );
}
