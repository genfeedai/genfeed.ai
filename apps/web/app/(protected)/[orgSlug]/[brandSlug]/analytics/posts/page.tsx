import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import PostsContent from '@/features/analytics/posts-list/posts-content';

export const generateMetadata = createPageMetadata('Posts Analytics');

export default function AnalyticsPostsPage() {
  return (
    <Suspense fallback={null}>
      <PostsContent />
    </Suspense>
  );
}
