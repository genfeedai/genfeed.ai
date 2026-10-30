'use client';

import { PageScope } from '@genfeedai/contracts';
import { useSearchParams } from 'next/navigation';
import PostsList from '@/features/posts/list/posts-list';

export default function AdminPostsRoute() {
  const searchParams = useSearchParams();
  const platform = searchParams.get('platform') ?? undefined;

  return (
    <PostsList scope={PageScope.SUPERADMIN} platform={platform || 'all'} />
  );
}
