'use client';

import type { IPost } from '@cloud/interfaces';
import { EMPTY_STATES } from '@genfeedai/constants';
import {
  ButtonSize,
  ButtonVariant,
  ComponentSize,
  Platform,
} from '@genfeedai/enums';
import { PLATFORM_LABEL_MAP } from '@helpers/content/posts.helper';
import { cn } from '@helpers/formatting/cn/cn.util';
import {
  formatDateInTimezone,
  getBrowserTimezone,
} from '@helpers/formatting/timezone/timezone.helper';
import { getPlatformIconComponent } from '@helpers/ui/platform-icon/platform-icon.helper';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useEvaluation } from '@hooks/ui/evaluation/use-evaluation/use-evaluation';
import Button from '@ui/buttons/base/Button';
import CardEmpty from '@ui/card/empty/CardEmpty';
import Badge from '@ui/display/badge/Badge';
import EvaluationBadge from '@ui/evaluation/badge/EvaluationBadge';
import {
  buttonVariants,
  Button as PrimitiveButton,
} from '@ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { memo, useMemo } from 'react';
import {
  HiArrowTopRightOnSquare,
  HiArrowUp,
  HiDocumentDuplicate,
  HiEllipsisHorizontal,
  HiEye,
  HiPencil,
  HiTrash,
} from 'react-icons/hi2';

export interface PostCardAction {
  key: string;
  icon: ReactNode | ((post: IPost) => ReactNode);
  label: string | ((post: IPost) => string);
  onClick: (post: IPost) => void;
  destructive?: boolean;
  isVisible?: (post: IPost) => boolean;
}

interface EvalGridCellProps {
  post: IPost;
  onEvaluated: (postId: string, score: number) => void;
}

const EvalGridCell = memo(function EvalGridCell({
  post,
  onEvaluated,
}: EvalGridCellProps) {
  const { evaluation, isEvaluating, evaluate } = useEvaluation({
    autoFetch: false,
    contentId: post.id,
    contentType: 'post',
  });

  const score = evaluation?.overallScore ?? post.evalScore;

  if (score != null) {
    return <EvaluationBadge score={score} size={ComponentSize.XS} />;
  }

  const handleEvaluate = async () => {
    try {
      const result = await evaluate();
      if (result?.overallScore != null) {
        onEvaluated(post.id, result.overallScore);
      }
    } catch {
      // Error handled by hook
    }
  };

  return (
    <Button
      variant={ButtonVariant.GHOST}
      icon={<HiArrowUp />}
      tooltip="Evaluate"
      isLoading={isEvaluating}
      onClick={(event) => {
        event.stopPropagation();
        handleEvaluate();
      }}
      size={ButtonSize.XS}
      className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 text-white/70 hover:bg-white/[0.06] hover:text-white"
    />
  );
});

function stripHtml(value?: string): string {
  if (!value) {
    return '';
  }

  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getPostTitle(post: IPost): string {
  const plainDescription = stripHtml(post.description);

  if (post.label?.trim()) {
    return post.label.trim();
  }

  if (!plainDescription) {
    return 'Untitled';
  }

  if (plainDescription.length <= 90) {
    return plainDescription;
  }

  return `${plainDescription.slice(0, 87).trimEnd()}...`;
}

function getPostPreview(post: IPost): string {
  const plainDescription = stripHtml(post.description);

  if (!plainDescription) {
    return 'No post copy yet.';
  }

  return plainDescription;
}

interface PostsGridProps {
  posts: IPost[];
  onPostEvaluated: (postId: string, score: number) => void;
  primaryAction?: PostCardAction;
  onOpenPostDetail?: (post: IPost) => void;
  secondaryActions?: PostCardAction[];
}

const PostsGrid = memo(
  function PostsGrid({
    posts,
    onPostEvaluated,
    primaryAction,
    onOpenPostDetail,
    secondaryActions = [],
  }: PostsGridProps) {
    const router = useRouter();
    const { href } = useOrgUrl();
    const browserTimezone = useMemo(() => getBrowserTimezone(), []);
    const handleOpenPost = (post: IPost) => {
      if (onOpenPostDetail) {
        onOpenPostDetail(post);
        return;
      }

      router.push(href(`/posts/${post.id}`));
    };

    if (posts.length === 0) {
      return (
        <CardEmpty
          label={EMPTY_STATES.POSTS_FOUND}
          description="Create and schedule posts to see them here."
        />
      );
    }

    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {posts.map((post) => {
          const PlatformIcon =
            getPlatformIconComponent(post.platform) ?? HiDocumentDuplicate;
          const title = getPostTitle(post);
          const preview = getPostPreview(post);
          const visiblePrimaryAction =
            primaryAction &&
            (!primaryAction.isVisible || primaryAction.isVisible(post))
              ? primaryAction
              : null;
          const visibleSecondaryActions = secondaryActions.filter(
            (action) => !action.isVisible || action.isVisible(post),
          );
          const primaryActionIcon =
            visiblePrimaryAction &&
            (typeof visiblePrimaryAction.icon === 'function'
              ? visiblePrimaryAction.icon(post)
              : visiblePrimaryAction.icon);
          const primaryActionLabel =
            visiblePrimaryAction &&
            (typeof visiblePrimaryAction.label === 'function'
              ? visiblePrimaryAction.label(post)
              : visiblePrimaryAction.label);

          return (
            <div
              key={post.id}
              role="button"
              tabIndex={0}
              onClick={() => handleOpenPost(post)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  handleOpenPost(post);
                }
              }}
              className="group rounded-xl border border-white/[0.08] bg-background/80 p-4 text-left transition-all duration-200 hover:border-white/[0.16] hover:bg-background"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-white/70">
                    <PlatformIcon className="h-4 w-4" />
                  </div>

                  <div className="min-w-0">
                    <h3 className="line-clamp-2 text-base font-semibold text-foreground">
                      {title}
                    </h3>
                    <p className="mt-1 text-xs uppercase tracking-[0.18em] text-foreground/35">
                      {post.platform === Platform.TWITTER
                        ? 'Post draft'
                        : (PLATFORM_LABEL_MAP[post.platform] ?? 'Post')}
                    </p>
                  </div>
                </div>

                {visibleSecondaryActions.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <PrimitiveButton
                        className={cn(
                          buttonVariants({
                            size: ButtonSize.ICON,
                            variant: ButtonVariant.GHOST,
                          }),
                          'h-8 w-8 rounded-full border border-white/10 bg-white/[0.03] text-white/55 hover:bg-white/[0.08] hover:text-white',
                        )}
                        aria-label="More post actions"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <HiEllipsisHorizontal className="h-4 w-4" />
                      </PrimitiveButton>
                    </DropdownMenuTrigger>

                    <DropdownMenuContent
                      align="end"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {visibleSecondaryActions.map((action) => {
                        const label =
                          typeof action.label === 'function'
                            ? action.label(post)
                            : action.label;
                        const icon =
                          typeof action.icon === 'function'
                            ? action.icon(post)
                            : action.icon;

                        return (
                          <DropdownMenuItem
                            key={action.key}
                            className={cn(
                              action.destructive &&
                                'text-destructive focus:text-destructive',
                            )}
                            onSelect={() => action.onClick(post)}
                          >
                            {icon}
                            <span>{label}</span>
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>

              <p className="mt-4 line-clamp-4 min-h-[5rem] text-sm leading-6 text-foreground/72">
                {preview}
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Badge status={post.status} size={ComponentSize.SM} />

                {post.scheduledDate && (
                  <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs text-foreground/60">
                    {formatDateInTimezone(
                      post.scheduledDate,
                      browserTimezone,
                      'short',
                    )}
                  </span>
                )}

                <EvalGridCell post={post} onEvaluated={onPostEvaluated} />
              </div>

              {visiblePrimaryAction && (
                <div className="mt-4 border-t border-white/[0.08] pt-4">
                  <Button
                    variant={ButtonVariant.SECONDARY}
                    size={ButtonSize.SM}
                    className="rounded-lg"
                    onClick={(event) => {
                      event.stopPropagation();
                      visiblePrimaryAction.onClick(post);
                    }}
                    icon={primaryActionIcon}
                  >
                    {primaryActionLabel}
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  },
  (prevProps, nextProps) => {
    if (prevProps.posts.length !== nextProps.posts.length) {
      return false;
    }
    if (prevProps.posts !== nextProps.posts) {
      const prevIds = new Set(prevProps.posts.map((post) => post.id));
      const nextIds = new Set(nextProps.posts.map((post) => post.id));
      if (prevIds.size !== nextIds.size) {
        return false;
      }
      for (const id of prevIds) {
        if (!nextIds.has(id)) {
          return false;
        }
      }
      for (let index = 0; index < prevProps.posts.length; index += 1) {
        if (prevProps.posts[index] !== nextProps.posts[index]) {
          const previousPost = prevProps.posts[index];
          const nextPost = nextProps.posts[index];
          if (
            previousPost.id !== nextPost.id ||
            previousPost.status !== nextPost.status ||
            previousPost.evalScore !== nextPost.evalScore ||
            previousPost.description !== nextPost.description ||
            previousPost.label !== nextPost.label ||
            previousPost.scheduledDate !== nextPost.scheduledDate
          ) {
            return false;
          }
        }
      }
    }
    if (prevProps.primaryAction !== nextProps.primaryAction) {
      return false;
    }
    if (prevProps.secondaryActions !== nextProps.secondaryActions) {
      return false;
    }
    if (prevProps.onPostEvaluated !== nextProps.onPostEvaluated) {
      return false;
    }

    return true;
  },
);

export const postCardIcons = {
  delete: <HiTrash className="h-4 w-4" />,
  edit: <HiPencil className="h-4 w-4" />,
  remix: <HiDocumentDuplicate className="h-4 w-4" />,
  viewIngredient: <HiEye className="h-4 w-4" />,
  viewPlatform: <HiArrowTopRightOnSquare className="h-4 w-4" />,
};

export default PostsGrid;
