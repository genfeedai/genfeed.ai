import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import ContentTeamHirePage from '@pages/agents/content-team/ContentTeamHirePage';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Hire Agent');

export default function ContentTeamHireRoute() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <ContentTeamHirePage />
    </Suspense>
  );
}
