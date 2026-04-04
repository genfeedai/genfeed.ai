import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import PostDetail from '@pages/posts/detail/post-detail';
import type { DetailPageProps } from '@props/pages/page.props';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { PageScope } from '@ui-constants/misc.constant';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Post Details');

export default async function PostDetailPage({ params }: DetailPageProps) {
  const { id } = await params;

  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <PostDetail postId={id} scope={PageScope.PUBLISHER} />
    </Suspense>
  );
}
