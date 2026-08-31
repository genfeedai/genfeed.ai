import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import FollowingPage from '@pages/trends/following/following-page';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Following');

export default function DiscoverFollowingPage() {
  return (
    <Suspense fallback={<PageLoadingState />}>
      <FollowingPage />
    </Suspense>
  );
}
