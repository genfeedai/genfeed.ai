'use client';

import {
  ButtonVariant,
  IngredientCategory,
  PageScope,
  Platform,
  PostCategory,
  PostStatus,
} from '@genfeedai/enums';
import type { IIngredient, IPost } from '@genfeedai/interfaces';
import { formatNumberWithCommas } from '@helpers/formatting/format/format.helper';
import { formatDateInTimezone } from '@helpers/formatting/timezone/timezone.helper';
import type { TableColumn } from '@props/ui/display/table.props';
import { EnvironmentService } from '@services/core/environment.service';
import Badge from '@ui/display/badge/Badge';
import HtmlContent from '@ui/display/html-content/HtmlContent';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import DropdownStatus from '@ui/dropdowns/status/DropdownStatus';
import { Button } from '@ui/primitives/button';
import Image from 'next/image';
import EvalCell from './EvalCell';

export type BuildPostsTableColumnsParams = {
  scope: PageScope | undefined;
  browserTimezone: string;
  hasPublicPosts: boolean;
  onEvaluated: (postId: string, score: number) => void;
  onOpenIngredient: (ingredient: IIngredient) => void;
  onStatusChanged: () => void;
};

function getDimensions(ingredient?: IIngredient): string {
  if (!ingredient) {
    return '';
  }
  const width = ingredient.metadataWidth;
  const height = ingredient.metadataHeight;
  if (!width || !height) {
    return '';
  }
  return `${width}×${height}`;
}

function formatDuration(seconds?: number): string {
  if (!seconds) {
    return '';
  }
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

export function buildPostsTableColumns({
  scope,
  browserTimezone,
  hasPublicPosts,
  onEvaluated,
  onOpenIngredient,
  onStatusChanged,
}: BuildPostsTableColumnsParams): TableColumn<IPost>[] {
  return [
    {
      className: 'w-20',
      header: '',
      key: 'thumbnail',
      render: (post: IPost) => {
        const ingredient = post.ingredients?.[0] as IIngredient;
        const isVideo = ingredient?.category === IngredientCategory.VIDEO;

        return (
          <Button
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
            className="w-16 aspect-video overflow-hidden bg-background cursor-pointer hover:opacity-80 transition-opacity"
            aria-label="View ingredient"
            onClick={(e) => {
              e.stopPropagation();
              if (ingredient) {
                onOpenIngredient(ingredient);
              }
            }}
          >
            {isVideo ? (
              <VideoPlayer
                src={ingredient?.ingredientUrl}
                thumbnail={ingredient.thumbnailUrl}
                config={{
                  controls: false,
                  loop: true,
                  muted: true,
                  playsInline: false,
                  preload: 'metadata',
                }}
              />
            ) : (
              <Image
                src={
                  ingredient?.ingredientUrl ||
                  `${EnvironmentService.assetsEndpoint}/placeholders/square.jpg`
                }
                alt={ingredient?.metadataLabel || 'Thumbnail'}
                width={64}
                height={36}
                className="object-cover w-full h-full"
              />
            )}
          </Button>
        );
      },
    },
    {
      className: 'max-w-md',
      header: 'Content',
      key: 'content',
      render: (post: IPost) => {
        const ingredient = post.ingredients?.[0] as IIngredient;
        const isVideo = post.category === PostCategory.VIDEO;
        const isTweet = post.platform === Platform.TWITTER;

        return (
          <div>
            <div className="font-semibold text-foreground">
              {isTweet && post.description ? (
                <HtmlContent
                  content={post.description}
                  className="line-clamp-1"
                />
              ) : ingredient ? (
                <Button
                  variant={ButtonVariant.UNSTYLED}
                  withWrapper={false}
                  className="truncate cursor-pointer hover:text-primary transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenIngredient(ingredient);
                  }}
                >
                  {ingredient.metadataLabel || 'Untitled'}
                </Button>
              ) : (
                <span className="truncate">Untitled</span>
              )}
            </div>

            <div className="text-xs text-foreground/60 flex items-center gap-2 mt-1">
              <span className="capitalize">{post.category}</span>
              {getDimensions(ingredient) && (
                <>
                  <span>•</span>
                  <span>{getDimensions(ingredient)}</span>
                </>
              )}
              {isVideo && ingredient?.metadataDuration && (
                <>
                  <span>•</span>
                  <span>{formatDuration(ingredient.metadataDuration)}</span>
                </>
              )}
            </div>
          </div>
        );
      },
    },
    {
      header: 'Platform',
      key: 'platform',
      render: (post: IPost) => <PlatformBadge platform={post.platform} />,
    },
    {
      header: 'Status',
      key: 'status',
      render: (post: IPost) => {
        const editableStatuses = [
          PostStatus.DRAFT,
          PostStatus.SCHEDULED,
          PostStatus.UNLISTED,
          PostStatus.PRIVATE,
          PostStatus.PUBLIC,
        ];

        const isEditable = editableStatuses.includes(post.status as PostStatus);

        if (isEditable) {
          // Use DropdownStatus for editable posts
          return (
            <DropdownStatus
              entity={post}
              onStatusChange={() => {
                // Refresh posts list after status change
                onStatusChanged();
              }}
            />
          );
        }

        // Use static Badge for non-editable statuses (PROCESSING, FAILED)
        const displayStatus =
          post.status === PostStatus.UNLISTED ? 'UNLISTED' : post.status;
        return (
          <Badge status={post.status} className="text-xs">
            {displayStatus}
          </Badge>
        );
      },
    },
    {
      className: 'text-xs',
      header: 'Scheduled',
      key: 'scheduledDate',
      render: (p: IPost) =>
        p.scheduledDate
          ? formatDateInTimezone(p.scheduledDate, browserTimezone, 'short')
          : '-',
    },
    // Eval column - hidden in Analytics app
    ...(scope !== PageScope.ANALYTICS
      ? [
          {
            className: 'text-center w-20',
            header: 'Eval',
            key: 'evalScore',
            render: (post: IPost) => (
              <EvalCell post={post} onEvaluated={onEvaluated} />
            ),
          },
        ]
      : []),
    ...(hasPublicPosts
      ? [
          {
            className: 'text-right',
            header: 'Views',
            key: 'views',
            render: (post: IPost) => (
              <span className="font-mono">
                {formatNumberWithCommas(post.totalViews || 0)}
              </span>
            ),
          },
          {
            className: 'text-right',
            header: 'Likes',
            key: 'likes',
            render: (post: IPost) => (
              <span className="font-mono">
                {formatNumberWithCommas(post.totalLikes || 0)}
              </span>
            ),
          },
          {
            className: 'text-right',
            header: 'Comments',
            key: 'comments',
            render: (post: IPost) => (
              <span className="font-mono">
                {formatNumberWithCommas(post.totalComments || 0)}
              </span>
            ),
          },
          {
            className: 'text-right',
            header: 'Eng %',
            key: 'engagement',
            render: (post: IPost) => (
              <span className="font-mono">
                {(post.avgEngagementRate || 0).toFixed(1)}%
              </span>
            ),
          },
        ]
      : []),
  ];
}
