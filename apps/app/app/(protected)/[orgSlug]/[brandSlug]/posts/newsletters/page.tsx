import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';
import NewslettersPage from './newsletters-page';

export const generateMetadata = createPageMetadata('Posts Newsletters');

export default function PostsNewslettersPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <NewslettersPage />
    </Suspense>
  );
}
