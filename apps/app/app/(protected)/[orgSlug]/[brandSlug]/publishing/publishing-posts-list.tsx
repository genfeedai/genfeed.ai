'use client';

import type { IPost } from '@genfeedai/interfaces';
import PostsList, { type PostsListProps } from '@pages/posts/list/posts-list';
import { useCallback } from 'react';
import { useOpenAgentComposer } from '@/hooks/use-open-agent-composer';
import {
  buildRewriteCaptionAgentPrompt,
  buildScheduleSuggestionAgentPrompt,
} from '@/lib/publishing/agent-seeded-actions';

export default function PublishingPostsList(props: PostsListProps) {
  const openAgentComposer = useOpenAgentComposer();

  const handleRewriteWithAgent = useCallback(
    (post: IPost) => {
      openAgentComposer(buildRewriteCaptionAgentPrompt({ postId: post.id }));
    },
    [openAgentComposer],
  );

  const handleSuggestScheduleWithAgent = useCallback(
    (post: IPost) => {
      openAgentComposer(
        buildScheduleSuggestionAgentPrompt({ postId: post.id }),
      );
    },
    [openAgentComposer],
  );

  return (
    <PostsList
      {...props}
      onRewriteWithAgent={handleRewriteWithAgent}
      onSuggestScheduleWithAgent={handleSuggestScheduleWithAgent}
    />
  );
}
