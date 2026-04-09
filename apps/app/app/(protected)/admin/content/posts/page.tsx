import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import { PageScope } from '@genfeedai/enums';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import PostsList from '@pages/posts/list/posts-list';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Posts');

interface AdminPostsPageProps {
  searchParams: Promise<{ platform?: string }>;
}

export default async function AdminPostsPage({
  searchParams,
}: AdminPostsPageProps) {
  const { platform } = await searchParams;

  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <PostsList scope={PageScope.SUPERADMIN} platform={platform || 'all'} />
    </Suspense>
  );
}
