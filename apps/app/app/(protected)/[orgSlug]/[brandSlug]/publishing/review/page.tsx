import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import ReviewQueueContent from './review-queue-content';

export const generateMetadata = createPageMetadata('Posts Review');

export default function PostsReviewPage() {
  return (
    <Suspense fallback={null}>
      <ReviewQueueContent />
    </Suspense>
  );
}
