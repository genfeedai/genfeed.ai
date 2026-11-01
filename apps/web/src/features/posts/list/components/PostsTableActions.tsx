'use client';

import { PageScope, PostStatus } from '@genfeedai/contracts';
import { ACCOUNT_GENERATION_POST_SOURCE } from '@genfeedai/contracts/constants';
import type { IPost } from '@genfeedai/contracts/interfaces';
import type { TableAction } from '@props/ui/display/table.props';
import {
  CalendarClock,
  Copy,
  ExternalLink,
  Eye,
  Pencil,
  RefreshCw,
  Repeat2,
  Sparkles,
  Trash2,
} from 'lucide-react';

export type BuildPostsTableActionsParams = {
  scope: PageScope | undefined;
  onDelete: (post: IPost) => void;
  onEdit: (post: IPost) => void;
  onViewIngredient: (post: IPost) => void;
  onOpenPlatformUrl: (post: IPost) => void;
  onRemix: (post: IPost) => void;
  onRepurpose: (post: IPost) => void;
  onRewriteWithAgent?: (post: IPost) => void;
  onRetry: (post: IPost) => void;
  onSuggestScheduleWithAgent?: (post: IPost) => void;
};

export function buildPostsTableActions({
  scope,
  onDelete,
  onEdit,
  onViewIngredient,
  onOpenPlatformUrl,
  onRemix,
  onRepurpose,
  onRewriteWithAgent,
  onRetry,
  onSuggestScheduleWithAgent,
}: BuildPostsTableActionsParams): TableAction<IPost>[] {
  if (scope === PageScope.SUPERADMIN) {
    return [
      {
        icon: () => <ExternalLink />,
        isVisible: (post: IPost) => !!post.platformUrl,
        onClick: onOpenPlatformUrl,
        tooltip: 'View',
      },
    ];
  }

  return [
    ...(onRewriteWithAgent
      ? [
          {
            icon: () => <Sparkles />,
            isVisible: (post: IPost) => post.status !== PostStatus.PUBLIC,
            onClick: onRewriteWithAgent,
            tooltip: 'Rewrite caption with agent',
          } satisfies TableAction<IPost>,
        ]
      : []),
    ...(onSuggestScheduleWithAgent
      ? [
          {
            icon: () => <CalendarClock />,
            isVisible: (post: IPost) => post.status !== PostStatus.PUBLIC,
            onClick: onSuggestScheduleWithAgent,
            tooltip: 'Suggest schedule with agent',
          } satisfies TableAction<IPost>,
        ]
      : []),
    {
      icon: () => <RefreshCw />,
      isVisible: (post: IPost) => post.status === PostStatus.FAILED,
      onClick: onRetry,
      tooltip: (post: IPost) =>
        post.source === ACCOUNT_GENERATION_POST_SOURCE
          ? 'Retry generation'
          : 'Retry publishing',
    },
    {
      icon: () => <Eye />,
      isVisible: (post: IPost) => {
        const hasIngredient = post.ingredients && post.ingredients.length > 0;
        return hasIngredient && post.status !== PostStatus.PUBLIC;
      },
      onClick: onViewIngredient,
      tooltip: 'View Ingredient',
    },
    {
      icon: () => <Pencil />,
      isVisible: (post: IPost) => {
        const editableStatuses = [
          PostStatus.SCHEDULED,
          PostStatus.DRAFT,
          PostStatus.FAILED,
          PostStatus.PROCESSING,
        ];

        return editableStatuses.includes(post.status as PostStatus);
      },
      onClick: onEdit,
      tooltip: 'Edit Post',
    },
    {
      icon: () => <Trash2 />,
      isVisible: (post: IPost) => {
        // Show delete for draft posts (not published)
        return post.status !== PostStatus.PUBLIC;
      },
      onClick: (post: IPost) => onDelete(post),
      tooltip: 'Delete',
      tone: 'destructive',
    },
    {
      icon: () => <Copy />,
      isVisible: (post: IPost) => post.status === PostStatus.PUBLIC,
      onClick: onRemix,
      tooltip: 'Create Remix',
    },
    {
      icon: () => <Repeat2 />,
      // Threads replies inherit their parent's channel; repurposing them
      // standalone would strand a fragment, so only root posts offer it.
      isVisible: (post: IPost) => !post.parent,
      onClick: onRepurpose,
      tooltip: 'Repurpose to another channel',
    },
    {
      icon: () => <ExternalLink />,
      isVisible: (post: IPost) => !!post.platformUrl,
      onClick: onOpenPlatformUrl,
      tooltip: 'View',
    },
  ];
}
