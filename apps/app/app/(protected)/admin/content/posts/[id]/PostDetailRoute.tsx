'use client';

import { PageScope } from '@genfeedai/contracts';
import { useRouteParams } from '@genfeedai/hooks/navigation/use-route-params';
import PostDetail from '@pages/posts/detail/post-detail';
import type { DetailPageProps } from '@props/pages/page.props';
import { readRouteParam } from '@/lib/route-params';

export default function PostDetailRoute() {
  const params = useRouteParams<Awaited<DetailPageProps['params']>>();
  const id = readRouteParam(params.id);

  return <PostDetail postId={id} scope={PageScope.SUPERADMIN} />;
}
