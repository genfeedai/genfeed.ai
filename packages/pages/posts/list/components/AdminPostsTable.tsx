'use client';

import { ComponentSize, PostStatus } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
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
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

interface AdminPostsTableProps {
  posts: IPost[];
  isLoading?: boolean;
  onOpenPostDetail: (post: IPost) => void;
}

const STATUS_PRESENTATION: Record<
  string,
  { canonicalStatus: string; labelKey: string }
> = {
  [PostStatus.DRAFT]: { canonicalStatus: 'planned', labelKey: 'draft' },
  [PostStatus.FAILED]: { canonicalStatus: 'failed', labelKey: 'failed' },
  [PostStatus.PENDING]: { canonicalStatus: 'pending', labelKey: 'pending' },
  [PostStatus.PRIVATE]: { canonicalStatus: 'planned', labelKey: 'private' },
  [PostStatus.PROCESSING]: {
    canonicalStatus: 'processing',
    labelKey: 'processing',
  },
  [PostStatus.PUBLIC]: { canonicalStatus: 'published', labelKey: 'public' },
  [PostStatus.SCHEDULED]: {
    canonicalStatus: 'scheduled',
    labelKey: 'scheduled',
  },
  [PostStatus.UNLISTED]: { canonicalStatus: 'planned', labelKey: 'unlisted' },
};

function getPostTitle(post: IPost, untitled: string): string {
  const label = post.label?.trim();
  if (label) return label;
  const copy = stripHtmlToPlainText(post.description).replace(/\s+/g, ' ');
  return copy || untitled;
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
 * a status badge and the date. A row opens the post in the right sidebar; the
 * title opens its admin detail page.
 */
export default function AdminPostsTable({
  posts,
  isLoading = false,
  onOpenPostDetail,
}: AdminPostsTableProps) {
  const translate = useTranslations('pages.posts.list.admin');
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
        header: translate('columnPost'),
        key: 'label',
        render: (post: IPost) => (
          <Link
            className="line-clamp-1 font-medium text-foreground hover:underline"
            href={`${APP_ROUTES.ADMIN.CONTENT.POSTS}/${post.id}`}
          >
            {getPostTitle(post, translate('untitled'))}
          </Link>
        ),
        subtext: (post: IPost) => (
          <span className="line-clamp-1 font-mono text-xs">
            {getPostOwner(post)}
          </span>
        ),
      },
      {
        header: translate('columnPlatform'),
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
        header: translate('columnStatus'),
        key: 'status',
        render: (post: IPost) => {
          const presentation = STATUS_PRESENTATION[post.status];
          const statusLabel = presentation
            ? translate(`status.${presentation.labelKey}`)
            : post.status;
          return (
            <div className="flex max-w-48 flex-col gap-1">
              <div>
                <Badge
                  status={presentation?.canonicalStatus ?? 'planned'}
                  size={ComponentSize.SM}
                >
                  {statusLabel}
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
        header: translate('columnDate'),
        key: 'scheduledDate',
        render: (post: IPost) => {
          const date = post.scheduledDate || post.publicationDate;
          return date ? (
            <span className="font-mono text-muted-foreground">
              {formatDateInTimezone(date, browserTimezone, 'short')}
            </span>
          ) : (
            <span className="text-muted-foreground">
              {translate('notScheduled')}
            </span>
          );
        },
      },
    ],
    [browserTimezone, translate],
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
            ? translate('viewOn', {
                platform: getPostsPlatformLabel(post.platform),
              })
            : translate('viewPost'),
      },
    ],
    [translate],
  );

  return (
    <AppTable<IPost>
      actions={actions}
      columns={columns}
      emptyLabel={translate('empty')}
      getRowKey={(post: IPost) => post.id}
      isLoading={isLoading}
      items={posts}
      onRowClick={onOpenPostDetail}
    />
  );
}
