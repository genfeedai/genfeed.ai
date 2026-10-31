import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import ConnectedTimelines from '@/features/trends/following/connected-timelines';

export const generateMetadata = createPageMetadata('Following');
export default function DiscoveryFollowingPage() {
  return (
    <Suspense fallback={null}>
      <ConnectedTimelines />
    </Suspense>
  );
}
