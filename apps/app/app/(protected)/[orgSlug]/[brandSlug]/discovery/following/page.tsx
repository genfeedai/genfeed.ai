import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import ConnectedTimelines from '@pages/trends/following/connected-timelines';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Following');
export default function DiscoveryFollowingPage() {
  return (
    <Suspense fallback={null}>
      <ConnectedTimelines />
    </Suspense>
  );
}
