import PostsContent from '@app-components/analytics/posts-content';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Posts Analytics');

export default function AnalyticsPostsPage() {
  return (
    <Suspense fallback={null}>
      <PostsContent />
    </Suspense>
  );
}
