'use client';

import { PageScope } from '@genfeedai/contracts';
import PostsList from '@pages/posts/list/posts-list';

import { useSearchParams } from 'next/navigation';

export default function AdminPostsRoute() {
  const searchParams = useSearchParams();
  const platform = searchParams.get('platform') ?? undefined;

  return (
    <PostsList scope={PageScope.SUPERADMIN} platform={platform || 'all'} />
  );
}
