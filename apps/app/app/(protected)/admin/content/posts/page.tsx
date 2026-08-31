import { PageScope } from '@genfeedai/enums';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import PostsList from '@pages/posts/list/posts-list';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
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
    <Suspense fallback={<PageLoadingState />}>
      <PostsList scope={PageScope.SUPERADMIN} platform={platform || 'all'} />
    </Suspense>
  );
}
