import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import ContentTeamPage from '@pages/agents/content-team/ContentTeamPage';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Content Team');

export default function ContentTeamRoute() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <ContentTeamPage />
    </Suspense>
  );
}
