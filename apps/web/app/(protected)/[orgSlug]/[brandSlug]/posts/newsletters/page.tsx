import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import NewslettersPage from '@pages/newsletters/newsletters-page';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Posts Newsletters');

export default function PostsNewslettersPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <NewslettersPage />
    </Suspense>
  );
}
