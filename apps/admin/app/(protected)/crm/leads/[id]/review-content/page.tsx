import ReviewContent from '@admin/(protected)/crm/leads/[id]/review-content/review-content';
import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Review Content');

export default async function ReviewContentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <ReviewContent id={id} />
    </Suspense>
  );
}
