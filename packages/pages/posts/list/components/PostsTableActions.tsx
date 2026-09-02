'use client';

import {
  ButtonSize,
  ButtonVariant,
  PageScope,
  PostStatus,
} from '@genfeedai/contracts';
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
        variant: ButtonVariant.SECONDARY,
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
            size: ButtonSize.SM,
            tooltip: 'Rewrite caption with agent',
            variant: ButtonVariant.SECONDARY,
          } satisfies TableAction<IPost>,
        ]
      : []),
    ...(onSuggestScheduleWithAgent
      ? [
          {
            icon: () => <CalendarClock />,
            isVisible: (post: IPost) => post.status !== PostStatus.PUBLIC,
            onClick: onSuggestScheduleWithAgent,
            size: ButtonSize.SM,
            tooltip: 'Suggest schedule with agent',
            variant: ButtonVariant.SECONDARY,
          } satisfies TableAction<IPost>,
        ]
      : []),
    {
      icon: () => <RefreshCw />,
      isVisible: (post: IPost) => post.status === PostStatus.FAILED,
      onClick: onRetry,
      size: ButtonSize.SM,
      tooltip: 'Retry publishing',
      variant: ButtonVariant.SECONDARY,
    },
    {
      icon: () => <Eye />,
      isVisible: (post: IPost) => {
        const hasIngredient = post.ingredients && post.ingredients.length > 0;
        return hasIngredient && post.status !== PostStatus.PUBLIC;
      },
      onClick: onViewIngredient,
      size: ButtonSize.SM,
      tooltip: 'View Ingredient',
      variant: ButtonVariant.SECONDARY,
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
      size: ButtonSize.SM,
      tooltip: 'Edit Post',
      variant: ButtonVariant.DEFAULT,
    },
    {
      icon: () => <Trash2 />,
      isVisible: (post: IPost) => {
        // Show delete for draft posts (not published)
        return post.status !== PostStatus.PUBLIC;
      },
      onClick: (post: IPost) => onDelete(post),
      size: ButtonSize.SM,
      tooltip: 'Delete',
      variant: ButtonVariant.DESTRUCTIVE,
    },
    {
      icon: () => <Copy />,
      isVisible: (post: IPost) => post.status === PostStatus.PUBLIC,
      onClick: onRemix,
      size: ButtonSize.SM,
      tooltip: 'Create Remix',
      variant: ButtonVariant.DEFAULT,
    },
    {
      icon: () => <Repeat2 />,
      // Threads replies inherit their parent's channel; repurposing them
      // standalone would strand a fragment, so only root posts offer it.
      isVisible: (post: IPost) => !post.parent,
      onClick: onRepurpose,
      size: ButtonSize.SM,
      tooltip: 'Repurpose to another channel',
      variant: ButtonVariant.DEFAULT,
    },
    {
      icon: () => <ExternalLink />,
      isVisible: (post: IPost) => !!post.platformUrl,
      onClick: onOpenPlatformUrl,
      tooltip: 'View',
      variant: ButtonVariant.SECONDARY,
    },
  ];
}
