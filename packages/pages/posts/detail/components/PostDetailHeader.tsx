'use client';

import {
  ButtonSize,
  ButtonVariant,
  CredentialPlatform,
  PostStatus,
} from '@genfeedai/enums';
import type { IPost } from '@genfeedai/interfaces';
import {
  getPostsPlatformLabel,
  getPublisherPostsHref,
} from '@helpers/content/posts.helper';
import Breadcrumb from '@ui/navigation/breadcrumb/Breadcrumb';
import { Button, Button as PrimitiveButton } from '@ui/primitives/button';
import { Dropdown } from '@ui/primitives/dropdown';
import { PageScope } from '@ui-constants/misc.constant';
import {
  buildPostAgentHref,
  buildPostAnalyticsHref,
} from '@utils/url/desktop-loop-url.util';
import Link from 'next/link';
import {
  HiArrowTopRightOnSquare,
  HiChartBar,
  HiDocumentDuplicate,
  HiEye,
  HiPencil,
  HiQueueList,
  HiSparkles,
  HiTrash,
} from 'react-icons/hi2';

export interface PostDetailHeaderProps {
  post: IPost;
  pathname: string;
  scope: PageScope;
  showBreadcrumb?: boolean;
  isPublished: boolean;
  hasChildren: boolean;
  viewMode: 'edit' | 'preview';
  isExpandingToThread?: boolean;
  onViewModeChange: (mode: 'edit' | 'preview') => void;
  onDelete: () => void;
  onCreateRemix?: () => void;
  onDuplicate?: () => void;
  onExpandToThread?: (count: 2 | 3 | 5) => void;
}

function getPostLabel(post: IPost): string {
  return post?.label || getPostsPlatformLabel(post.platform);
}

const THREAD_LENGTH_OPTIONS = [
  { label: '2 tweets', value: 2 as const },
  { label: '3 tweets', value: 3 as const },
  { label: '5 tweets', value: 5 as const },
];

export default function PostDetailHeader({
  post,
  pathname,
  scope,
  showBreadcrumb = true,
  isPublished,
  hasChildren,
  viewMode,
  isExpandingToThread = false,
  onViewModeChange,
  onDelete,
  onCreateRemix,
  onDuplicate: _onDuplicate,
  onExpandToThread,
}: PostDetailHeaderProps) {
  const isEditable = scope === PageScope.PUBLISHER && !isPublished;
  const canCreateRemix = post.status === PostStatus.PUBLIC;

  // Can expand to thread if:
  // - It's a Twitter/X post
  // - It's editable (not published)
  // - It doesn't already have children (not already a thread)
  // - Handler is provided
  const canExpandToThread =
    post.platform === CredentialPlatform.TWITTER &&
    isEditable &&
    !hasChildren &&
    onExpandToThread;

  return (
    <>
      {showBreadcrumb ? (
        <Breadcrumb
          segments={[
            { href: getPublisherPostsHref(), label: 'Posts' },
            { href: pathname, label: getPostLabel(post) },
          ]}
        />
      ) : null}

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-foreground/60">Post detail</p>
          <h1 className="text-2xl font-bold">{getPostLabel(post)}</h1>
        </div>

        <div className="flex gap-2">
          {post.platformUrl && (
            <PrimitiveButton asChild variant={ButtonVariant.SECONDARY}>
              <a
                href={post.platformUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open published post"
              >
                <HiArrowTopRightOnSquare />
              </a>
            </PrimitiveButton>
          )}

          {/* Expand to Thread dropdown - shown for editable Twitter posts without children */}
          {canExpandToThread && (
            <Dropdown
              minWidth="160px"
              trigger={
                <Button
                  label={
                    isExpandingToThread ? 'Expanding...' : 'Expand to Thread'
                  }
                  variant={ButtonVariant.SECONDARY}
                  icon={<HiQueueList className="h-4 w-4" />}
                  isDisabled={isExpandingToThread}
                />
              }
            >
              <div className="flex flex-col gap-1 p-1">
                <p className="px-2 py-1 text-xs font-medium text-foreground/60">
                  Select thread length
                </p>
                {THREAD_LENGTH_OPTIONS.map((option) => (
                  <Button
                    key={option.value}
                    withWrapper={false}
                    variant={ButtonVariant.GHOST}
                    size={ButtonSize.SM}
                    className="w-full text-left"
                    onClick={() => onExpandToThread(option.value)}
                    isDisabled={isExpandingToThread}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </Dropdown>
          )}

          {/* Create Remix button - shown for published posts */}
          {canCreateRemix && onCreateRemix && (
            <Button
              label="Remix"
              tooltip="Create a variant of this post with different wording"
              tooltipPosition="left"
              variant={ButtonVariant.SECONDARY}
              onClick={onCreateRemix}
              icon={<HiDocumentDuplicate className="h-4 w-4" />}
            />
          )}

          {canCreateRemix && (
            <PrimitiveButton asChild variant={ButtonVariant.SECONDARY}>
              <Link href={buildPostAnalyticsHref(post.id)}>
                <HiChartBar className="h-4 w-4" />
                Performance
              </Link>
            </PrimitiveButton>
          )}

          {canCreateRemix && (
            <PrimitiveButton asChild variant={ButtonVariant.SECONDARY}>
              <Link href={buildPostAgentHref(getPostLabel(post))}>
                <HiSparkles className="h-4 w-4" />
                Ask Agent
              </Link>
            </PrimitiveButton>
          )}

          {isEditable && (
            <>
              {/* View mode toggle */}
              <Button
                label={viewMode === 'edit' ? 'Preview' : 'Edit'}
                variant={ButtonVariant.SECONDARY}
                onClick={() =>
                  onViewModeChange(viewMode === 'edit' ? 'preview' : 'edit')
                }
                icon={
                  viewMode === 'edit' ? (
                    <HiEye className="h-4 w-4" />
                  ) : (
                    <HiPencil className="h-4 w-4" />
                  )
                }
              />

              {/* Delete button */}
              <Button
                label="Delete"
                variant={ButtonVariant.DESTRUCTIVE}
                onClick={onDelete}
                icon={<HiTrash className="h-4 w-4" />}
              />
            </>
          )}
        </div>
      </div>
    </>
  );
}
