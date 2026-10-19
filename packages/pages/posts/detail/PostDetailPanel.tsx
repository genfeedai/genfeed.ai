'use client';

import type { PageScope } from '@genfeedai/contracts';
import PostDetail from '@pages/posts/detail/post-detail';

export interface PostDetailPanelProps {
  postId: string | null;
  scope: PageScope;
  onClose: () => void;
}

/** The selected post's detail in the shell's right context sidebar. */
export default function PostDetailPanel({
  postId,
  scope,
  onClose,
}: PostDetailPanelProps) {
  if (!postId) {
    return null;
  }

  return (
    <PostDetail
      onClose={onClose}
      postId={postId}
      presentation="sidebar"
      scope={scope}
    />
  );
}
