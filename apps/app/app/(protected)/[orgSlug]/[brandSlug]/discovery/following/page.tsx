import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import FollowingPage from '@pages/trends/following/following-page';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Following');

export default function DiscoveryFollowingPage() {
  return (
    <Suspense fallback={null}>
      <FollowingPage />
    </Suspense>
  );
}
