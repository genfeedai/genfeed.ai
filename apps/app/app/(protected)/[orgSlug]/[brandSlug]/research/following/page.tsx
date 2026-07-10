import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import FollowingPage from '@pages/trends/following/following-page';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Following');

export default function ResearchFollowingPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <FollowingPage />
    </Suspense>
  );
}
