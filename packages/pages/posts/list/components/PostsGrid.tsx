'use client';

import {
  ButtonSize,
  ButtonVariant,
  ComponentSize,
  Platform,
  PostStatus,
} from '@genfeedai/contracts';
import { EMPTY_STATES } from '@genfeedai/contracts/constants';
import type { IPost } from '@genfeedai/contracts/interfaces';
import {
  getPostsPlatformLabel,
  getPublishingPostHref,
} from '@helpers/content/posts.helper';
import { cn } from '@helpers/formatting/cn/cn.util';
import {
  formatDateInTimezone,
  getBrowserTimezone,
} from '@helpers/formatting/timezone/timezone.helper';
import { getPlatformIconComponent } from '@helpers/ui/platform-icon/platform-icon.helper';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useEvaluation } from '@hooks/ui/evaluation/use-evaluation/use-evaluation';
import Card from '@ui/card/Card';
import CardEmpty from '@ui/card/empty/CardEmpty';
import Badge from '@ui/display/badge/Badge';
import EvaluationBadge from '@ui/evaluation/badge/EvaluationBadge';
import { Button, Button as PrimitiveButton } from '@ui/primitives/button';
import { buttonVariants } from '@ui/primitives/button.variants';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import { ArrowUp, Copy, Ellipsis, ExternalLink } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { memo, useMemo } from 'react';

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

  const score = evaluation?.data.overallScore ?? post.evalScore;

  if (score != null) {
    return <EvaluationBadge score={score} size={ComponentSize.XS} />;
  }

  const handleEvaluate = async () => {
    try {
      const result = await evaluate();
      if (result?.data.overallScore != null) {
        onEvaluated(post.id, result.data.overallScore);
      }
    } catch {
      // Error handled by hook
    }
  };

  return (
    <Button
      variant={ButtonVariant.GHOST}
      icon={<ArrowUp />}
      label="Evaluate"
      tooltip="Evaluate"
      isLoading={isEvaluating}
      onClick={(event) => {
        event.stopPropagation();
        handleEvaluate();
      }}
      size={ButtonSize.XS}
      className="rounded-lg border border-border bg-muted px-2.5 text-muted-foreground hover:bg-hover hover:text-foreground"
    />
  );
});

function getPostMediaUrls(post: IPost): string[] {
  return (post.ingredients ?? [])
    .map(
      (ingredient) =>
        ingredient.cdnUrl ||
        ingredient.thumbnailUrl ||
        ingredient.ingredientUrl ||
        '',
    )
    .filter((url): url is string => Boolean(url))
    .slice(0, 4);
}

function getStatusPresentation(status: string): {
  canonicalStatus: string;
  label: string;
  variant: 'success' | 'info' | 'warning' | 'destructive' | 'ghost';
} {
  switch (status.toLowerCase()) {
    case PostStatus.PUBLIC:
      return {
        canonicalStatus: 'published',
        label: 'Posted',
        variant: 'success',
      };
    case PostStatus.SCHEDULED:
      return {
        canonicalStatus: 'scheduled',
        label: 'Scheduled',
        variant: 'info',
      };
    case PostStatus.PROCESSING:
      return {
        canonicalStatus: 'processing',
        label: 'Publishing',
        variant: 'info',
      };
    case PostStatus.PENDING:
      return {
        canonicalStatus: 'pending',
        label: 'Pending',
        variant: 'warning',
      };
    case PostStatus.FAILED:
      return {
        canonicalStatus: 'failed',
        label: 'Failed',
        variant: 'destructive',
      };
    case PostStatus.DRAFT:
      return {
        canonicalStatus: 'planned',
        label: 'Draft',
        variant: 'warning',
      };
    default:
      return { canonicalStatus: 'planned', label: status, variant: 'ghost' };
  }
}

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
    const { href } = useOrgUrl();
    const browserTimezone = useMemo(() => getBrowserTimezone(), []);

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
          const PlatformIcon = post.platform
            ? (getPlatformIconComponent(post.platform) ?? Copy)
            : Copy;
          const platformLabel = post.platform
            ? getPostsPlatformLabel(post.platform)
            : 'Post';
          const title = getPostTitle(post);
          const heading = (
            <>
              <div className="flex size-10 flex-shrink-0 items-center justify-center rounded-md border border-border bg-background-secondary text-muted-foreground">
                <PlatformIcon className="size-4" />
              </div>
              <div className="min-w-0">
                <h3 className="line-clamp-2 text-base font-semibold text-foreground">
                  {title}
                </h3>
                <p className="mt-1 text-xs uppercase tracking-[0.18em] text-foreground/35">
                  {platformLabel}
                </p>
              </div>
            </>
          );
          const preview = getPostPreview(post);
          const mediaUrls = getPostMediaUrls(post);
          const statusPresentation = getStatusPresentation(post.status);
          const visiblePrimaryAction =
            primaryAction &&
            (!primaryAction.isVisible || primaryAction.isVisible(post))
              ? primaryAction
              : null;
          const visibleSecondaryActions = secondaryActions.filter(
            (action) =>
              action.key !== 'open-platform' &&
              (!action.isVisible || action.isVisible(post)),
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
            <Card
              key={post.id}
              className="group text-left hover:bg-accent hover:shadow-border-strong"
              bodyClassName="gap-0 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                {onOpenPostDetail ? (
                  <Button
                    className="flex min-w-0 items-start gap-3 text-left"
                    onClick={() => onOpenPostDetail(post)}
                    type="button"
                    variant={ButtonVariant.UNSTYLED}
                    withWrapper={false}
                  >
                    {heading}
                  </Button>
                ) : (
                  <Link
                    className="flex min-w-0 items-start gap-3 text-left"
                    href={href(getPublishingPostHref(post.id))}
                  >
                    {heading}
                  </Link>
                )}

                {visibleSecondaryActions.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <PrimitiveButton
                        className={cn(
                          buttonVariants({
                            size: ButtonSize.ICON,
                            variant: ButtonVariant.GHOST,
                          }),
                          'h-8 w-8 rounded-full border border-border bg-background-secondary text-muted-foreground hover:bg-hover hover:text-foreground',
                        )}
                        aria-label="More post actions"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Ellipsis className="size-4" />
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

              {mediaUrls.length > 0 && (
                <div
                  className={cn(
                    'mt-4 grid aspect-[16/9] overflow-hidden rounded-lg bg-secondary',
                    mediaUrls.length > 1 && 'grid-cols-2',
                  )}
                >
                  {mediaUrls.map((mediaUrl, index) => (
                    <div
                      key={`${post.id}-${mediaUrl}`}
                      className={cn(
                        'relative min-h-0 overflow-hidden',
                        mediaUrls.length === 3 && index === 0 && 'row-span-2',
                      )}
                    >
                      <Image
                        alt={
                          post.ingredients?.[index]?.metadataLabel ||
                          `${title} media ${index + 1}`
                        }
                        className="object-cover"
                        fill
                        sizes="(max-width: 768px) 100vw, 33vw"
                        src={mediaUrl}
                        unoptimized
                      />
                    </div>
                  ))}
                </div>
              )}

              <p className="mt-4 line-clamp-4 min-h-[5rem] text-sm leading-6 text-foreground/72">
                {preview}
              </p>

              {post.status === PostStatus.FAILED &&
                post.targetError?.message && (
                  <p
                    className="mt-3 truncate text-xs text-destructive"
                    title={post.targetError.message}
                  >
                    {post.targetError.message}
                  </p>
                )}

              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
                <Badge
                  status={statusPresentation.canonicalStatus}
                  variant={statusPresentation.variant}
                  size={ComponentSize.SM}
                >
                  {statusPresentation.label}
                </Badge>

                {post.scheduledDate && (
                  <span className="rounded-full border border-border bg-background-secondary px-2.5 py-1 text-xs text-foreground/60">
                    {formatDateInTimezone(
                      post.scheduledDate,
                      browserTimezone,
                      'short',
                    )}
                  </span>
                )}

                <EvalGridCell post={post} onEvaluated={onPostEvaluated} />

                {visiblePrimaryAction && (
                  <Button
                    variant={ButtonVariant.SECONDARY}
                    size={ButtonSize.SM}
                    onClick={(event) => {
                      event.stopPropagation();
                      visiblePrimaryAction.onClick(post);
                    }}
                    icon={primaryActionIcon}
                  >
                    {primaryActionLabel}
                  </Button>
                )}

                {post.platformUrl && (
                  <PrimitiveButton
                    asChild
                    size={ButtonSize.SM}
                    variant={ButtonVariant.GHOST}
                  >
                    <a
                      href={post.platformUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="size-4" />
                      {post.platform === Platform.TWITTER
                        ? 'View on X'
                        : 'View post'}
                    </a>
                  </PrimitiveButton>
                )}
              </div>
            </Card>
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
            previousPost.ingredients !== nextPost.ingredients ||
            previousPost.label !== nextPost.label ||
            previousPost.platformUrl !== nextPost.platformUrl ||
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
    // Each card renders either a Button bound to this callback or a Link when
    // it is absent, so skipping the re-render keeps a stale handler — or the
    // wrong element entirely.
    if (prevProps.onOpenPostDetail !== nextProps.onOpenPostDetail) {
      return false;
    }

    return true;
  },
);

export default PostsGrid;
