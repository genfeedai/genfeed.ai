import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import ArticlesList from '@pages/articles/list/articles-list';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Articles');

export default function LabArticlesPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <ArticlesList />
    </Suspense>
  );
}
