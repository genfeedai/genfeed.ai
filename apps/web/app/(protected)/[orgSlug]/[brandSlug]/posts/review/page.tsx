import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import ReviewQueueContent from '@pages/review/review-queue-content';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Posts Review');

export default function PostsReviewPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <ReviewQueueContent />
    </Suspense>
  );
}
