'use client';

import { PageScope } from '@genfeedai/contracts';
import PostDetail from '@pages/posts/detail/post-detail';
import type { DetailPageProps } from '@props/pages/page.props';

import { useParams } from 'next/navigation';
import { readRouteParam } from '@/lib/route-params';

export default function PostDetailRoute() {
  const params = useParams<Awaited<DetailPageProps['params']>>();
  const id = readRouteParam(params.id);

  return <PostDetail postId={id} scope={PageScope.SUPERADMIN} />;
}
