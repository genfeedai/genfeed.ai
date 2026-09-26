import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import PublishingPostComposer from '@pages/posts/compose/publishing-post-composer';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('New post');

export default function PublishingNewPostPage() {
  return (
    <Suspense fallback={null}>
      <PublishingPostComposer />
    </Suspense>
  );
}
