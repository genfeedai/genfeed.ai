'use client';

import { PageScope, PostStatus } from '@genfeedai/enums';
import type { IPost } from '@genfeedai/interfaces';
import type { PostCardAction } from '@pages/posts/list/components/PostsGrid';
import { postCardIcons } from '@pages/posts/list/components/posts-grid.helpers';

export type BuildPostsCardActionsParams = {
  scope: PageScope | undefined;
  editableStatuses: PostStatus[];
  onEdit: (post: IPost) => void;
  onDelete: (post: IPost) => void;
  onRemix: (post: IPost) => void;
  onRewriteWithAgent?: (post: IPost) => void;
  onRetry: (post: IPost) => void;
  onSuggestScheduleWithAgent?: (post: IPost) => void;
  onViewIngredient: (post: IPost) => void;
  onOpenPlatformUrl: (post: IPost) => void;
};

export type PostsCardActions = {
  primaryCardAction: PostCardAction | undefined;
  secondaryCardActions: PostCardAction[];
};

export function buildPostsCardActions({
  scope,
  editableStatuses,
  onEdit,
  onDelete,
  onRemix,
  onRewriteWithAgent,
  onRetry,
  onSuggestScheduleWithAgent,
  onViewIngredient,
  onOpenPlatformUrl,
}: BuildPostsCardActionsParams): PostsCardActions {
  const primaryCardAction: PostCardAction | undefined =
    scope === PageScope.SUPERADMIN
      ? undefined
      : {
          icon: postCardIcons.edit,
          isVisible: (post: IPost) =>
            editableStatuses.includes(post.status as PostStatus),
          key: 'edit',
          label: 'Edit post',
          onClick: onEdit,
        };

  const secondaryCardActions: PostCardAction[] =
    scope !== PageScope.SUPERADMIN
      ? [
          ...(onRewriteWithAgent
            ? [
                {
                  icon: postCardIcons.rewriteWithAgent,
                  isVisible: (post: IPost) => post.status !== PostStatus.PUBLIC,
                  key: 'rewrite-with-agent',
                  label: 'Rewrite caption with agent',
                  onClick: onRewriteWithAgent,
                } satisfies PostCardAction,
              ]
            : []),
          ...(onSuggestScheduleWithAgent
            ? [
                {
                  icon: postCardIcons.suggestScheduleWithAgent,
                  isVisible: (post: IPost) => post.status !== PostStatus.PUBLIC,
                  key: 'suggest-schedule-with-agent',
                  label: 'Suggest schedule with agent',
                  onClick: onSuggestScheduleWithAgent,
                } satisfies PostCardAction,
              ]
            : []),
          {
            icon: postCardIcons.retry,
            isVisible: (post: IPost) => post.status === PostStatus.FAILED,
            key: 'retry',
            label: 'Retry publishing',
            onClick: onRetry,
          },
          {
            icon: postCardIcons.viewIngredient,
            isVisible: (post: IPost) =>
              Boolean(post.ingredients?.length) &&
              post.status !== PostStatus.PUBLIC,
            key: 'view-ingredient',
            label: 'View ingredient',
            onClick: onViewIngredient,
          },
          {
            destructive: true,
            icon: postCardIcons.delete,
            isVisible: (post: IPost) => post.status !== PostStatus.PUBLIC,
            key: 'delete',
            label: 'Delete post',
            onClick: onDelete,
          },
          {
            icon: postCardIcons.remix,
            isVisible: (post: IPost) => post.status === PostStatus.PUBLIC,
            key: 'remix',
            label: 'Create remix',
            onClick: onRemix,
          },
          {
            icon: postCardIcons.viewPlatform,
            isVisible: (post: IPost) => Boolean(post.platformUrl),
            key: 'open-platform',
            label: 'Open on platform',
            onClick: onOpenPlatformUrl,
          },
        ]
      : [
          {
            icon: postCardIcons.viewPlatform,
            isVisible: (post: IPost) => Boolean(post.platformUrl),
            key: 'open-platform',
            label: 'Open on platform',
            onClick: onOpenPlatformUrl,
          },
        ];

  return { primaryCardAction, secondaryCardActions };
}
