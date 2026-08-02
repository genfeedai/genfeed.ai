import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';
import ContentTeamHirePage from './ContentTeamHirePage';

export const generateMetadata = createPageMetadata('Hire Agent');

export default function ContentTeamHireRoute() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <ContentTeamHirePage />
    </Suspense>
  );
}
