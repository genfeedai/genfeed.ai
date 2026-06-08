'use client';

import {
  ButtonSize,
  ButtonVariant,
  PageScope,
  PostStatus,
} from '@genfeedai/enums';
import type { IPost } from '@genfeedai/interfaces';
import type { TableAction } from '@props/ui/display/table.props';
import {
  HiArrowTopRightOnSquare,
  HiDocumentDuplicate,
  HiEye,
  HiPencil,
  HiTrash,
} from 'react-icons/hi2';

export type BuildPostsTableActionsParams = {
  scope: PageScope | undefined;
  onDelete: (post: IPost) => void;
  onEdit: (post: IPost) => void;
  onViewIngredient: (post: IPost) => void;
  onOpenPlatformUrl: (post: IPost) => void;
  onRemix: (post: IPost) => void;
};

export function buildPostsTableActions({
  scope,
  onDelete,
  onEdit,
  onViewIngredient,
  onOpenPlatformUrl,
  onRemix,
}: BuildPostsTableActionsParams): TableAction<IPost>[] {
  if (scope === PageScope.SUPERADMIN) {
    return [
      {
        icon: () => <HiArrowTopRightOnSquare />,
        isVisible: (post: IPost) => !!post.platformUrl,
        onClick: onOpenPlatformUrl,
        tooltip: 'View',
        variant: ButtonVariant.SECONDARY,
      },
    ];
  }

  return [
    {
      icon: () => <HiEye />,
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
      icon: () => <HiPencil />,
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
      icon: () => <HiTrash />,
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
      icon: () => <HiDocumentDuplicate />,
      isVisible: (post: IPost) => post.status === PostStatus.PUBLIC,
      onClick: onRemix,
      size: ButtonSize.SM,
      tooltip: 'Create Remix',
      variant: ButtonVariant.DEFAULT,
    },
    {
      icon: () => <HiArrowTopRightOnSquare />,
      isVisible: (post: IPost) => !!post.platformUrl,
      onClick: onOpenPlatformUrl,
      tooltip: 'View',
      variant: ButtonVariant.SECONDARY,
    },
  ];
}
