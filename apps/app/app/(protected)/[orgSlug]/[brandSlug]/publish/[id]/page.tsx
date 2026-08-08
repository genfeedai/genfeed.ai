import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import type { DetailPageProps } from '@props/pages/page.props';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

import PublishPostDetailPage from './PublishPostDetailPage';

export const generateMetadata = createPageMetadata('Post Details');

export default async function PostDetailPage({ params }: DetailPageProps) {
  const { id } = await params;

  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <PublishPostDetailPage postId={id} />
    </Suspense>
  );
}
