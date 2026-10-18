'use client';

import { ComponentSize, PostStatus } from '@genfeedai/contracts';
import type { IPost } from '@genfeedai/contracts/interfaces';
import { getPostsPlatformLabel } from '@helpers/content/posts.helper';
import {
  formatDateInTimezone,
  getBrowserTimezone,
} from '@helpers/formatting/timezone/timezone.helper';
import { stripHtmlToPlainText } from '@helpers/security/strip-html.helper';
import { getPlatformIconComponent } from '@helpers/ui/platform-icon/platform-icon.helper';
import type { TableAction, TableColumn } from '@props/ui/display/table.props';
import Badge from '@ui/display/badge/Badge';
import AppTable from '@ui/display/table/Table';
import { ExternalLink, FileText } from 'lucide-react';
import Image from 'next/image';
import { useMemo } from 'react';

interface AdminPostsTableProps {
  posts: IPost[];
  isLoading?: boolean;
  onOpenPostDetail: (post: IPost) => void;
}

const STATUS_PRESENTATION: Record<
  string,
  { canonicalStatus: string; label: string }
> = {
  [PostStatus.DRAFT]: { canonicalStatus: 'planned', label: 'Draft' },
  [PostStatus.FAILED]: { canonicalStatus: 'failed', label: 'Failed' },
  [PostStatus.PENDING]: { canonicalStatus: 'pending', label: 'Pending' },
  [PostStatus.PRIVATE]: { canonicalStatus: 'planned', label: 'Private' },
  [PostStatus.PROCESSING]: {
    canonicalStatus: 'processing',
    label: 'Publishing',
  },
  [PostStatus.PUBLIC]: { canonicalStatus: 'published', label: 'Posted' },
  [PostStatus.SCHEDULED]: { canonicalStatus: 'scheduled', label: 'Scheduled' },
  [PostStatus.UNLISTED]: { canonicalStatus: 'planned', label: 'Unlisted' },
};

function getPostTitle(post: IPost): string {
  const label = post.label?.trim();
  if (label) return label;
  const copy = stripHtmlToPlainText(post.description).replace(/\s+/g, ' ');
  return copy || 'Untitled';
}

function getPostThumbnailUrl(post: IPost): string | undefined {
  const ingredient = post.ingredients?.[0];
  return (
    ingredient?.thumbnailUrl ||
    ingredient?.cdnUrl ||
    ingredient?.ingredientUrl ||
    undefined
  );
}

/** Who owns the post, so an operator can tell accounts apart at a glance. */
function getPostOwner(post: IPost): string {
  return [post.organization?.label, post.brand?.label, post.user?.email]
    .filter(Boolean)
    .join(' · ');
}

/**
 * The admin posts list: one row per post, media first, with the platform,
 * a status badge and the date. A row opens the post in the detail overlay
 * rather than in the owner's account.
 */
export default function AdminPostsTable({
  posts,
  isLoading = false,
  onOpenPostDetail,
}: AdminPostsTableProps) {
  const browserTimezone = useMemo(() => getBrowserTimezone(), []);

  const columns = useMemo<TableColumn<IPost>[]>(
    () => [
      {
        className: 'w-16',
        header: '',
        key: 'media',
        render: (post: IPost) => {
          const thumbnailUrl = getPostThumbnailUrl(post);
          return (
            <div className="relative flex size-12 items-center justify-center overflow-hidden bg-background-secondary text-muted-foreground">
              {thumbnailUrl ? (
                <Image
                  alt=""
                  className="object-cover"
                  fill
                  sizes="48px"
                  src={thumbnailUrl}
                  unoptimized
                />
              ) : (
                <FileText aria-hidden="true" className="size-4" />
              )}
            </div>
          );
        },
      },
      {
        className: 'max-w-md',
        header: 'Post',
        key: 'label',
        render: (post: IPost) => (
          <span className="line-clamp-1 font-medium text-foreground">
            {getPostTitle(post)}
          </span>
        ),
        subtext: (post: IPost) => (
          <span className="line-clamp-1 font-mono text-xs">
            {getPostOwner(post)}
          </span>
        ),
      },
      {
        header: 'Platform',
        key: 'platform',
        render: (post: IPost) => {
          if (!post.platform) return '—';
          const PlatformIcon = getPlatformIconComponent(post.platform);
          return (
            <span className="inline-flex items-center gap-2 text-sm text-foreground/80">
              {PlatformIcon ? (
                <PlatformIcon aria-hidden="true" className="size-4" />
              ) : null}
              {getPostsPlatformLabel(post.platform)}
            </span>
          );
        },
      },
      {
        header: 'Status',
        key: 'status',
        render: (post: IPost) => {
          const presentation = STATUS_PRESENTATION[post.status] ?? {
            canonicalStatus: 'planned',
            label: post.status,
          };
          return (
            <div className="flex max-w-48 flex-col gap-1">
              <div>
                <Badge
                  status={presentation.canonicalStatus}
                  size={ComponentSize.SM}
                >
                  {presentation.label}
                </Badge>
              </div>
              {post.status === PostStatus.FAILED &&
              post.targetError?.message ? (
                <p
                  className="truncate text-xs text-destructive"
                  title={post.targetError.message}
                >
                  {post.targetError.message}
                </p>
              ) : null}
            </div>
          );
        },
      },
      {
        className: 'text-xs',
        header: 'Date',
        key: 'scheduledDate',
        render: (post: IPost) => {
          const date = post.scheduledDate || post.publicationDate;
          return date ? (
            <span className="font-mono text-muted-foreground">
              {formatDateInTimezone(date, browserTimezone, 'short')}
            </span>
          ) : (
            <span className="text-muted-foreground">Not scheduled</span>
          );
        },
      },
    ],
    [browserTimezone],
  );

  const actions = useMemo<TableAction<IPost>[]>(
    () => [
      {
        href: (post: IPost) => post.platformUrl || undefined,
        icon: <ExternalLink className="size-4" />,
        isExternal: true,
        isVisible: (post: IPost) => Boolean(post.platformUrl),
        tooltip: (post: IPost) =>
          post.platform
            ? `View on ${getPostsPlatformLabel(post.platform)}`
            : 'View post',
      },
    ],
    [],
  );

  return (
    <AppTable<IPost>
      actions={actions}
      columns={columns}
      emptyLabel="No posts found"
      getRowKey={(post: IPost) => post.id}
      isLoading={isLoading}
      items={posts}
      onRowClick={onOpenPostDetail}
    />
  );
}
