'use client';

import { PageScope } from '@genfeedai/enums';
import PostDetail from '@pages/posts/detail/post-detail';
import type { ReactNode } from 'react';

import PostDetailContextHost from './PostDetailContextHost';

interface PublishPostDetailPageProps {
  postId: string;
}

export default function PublishPostDetailPage({
  postId,
}: PublishPostDetailPageProps) {
  return (
    <PostDetail
      postId={postId}
      presentation="page"
      scope={PageScope.PUBLISHER}
      renderContextSidebar={(sidebar: ReactNode, contextLabel: string) => (
        <PostDetailContextHost contextLabel={contextLabel}>
          {sidebar}
        </PostDetailContextHost>
      )}
    />
  );
}
