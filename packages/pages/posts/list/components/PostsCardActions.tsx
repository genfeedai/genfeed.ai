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
