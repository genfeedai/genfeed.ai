'use client';

import type { IPost } from '@genfeedai/interfaces';
import {
  ButtonSize,
  ButtonVariant,
  CredentialPlatform,
  PostStatus,
} from '@genfeedai/enums';
import {
  getPostsPlatformLabel,
  getPublisherPostsHref,
} from '@helpers/content/posts.helper';
import Button from '@ui/buttons/base/Button';
import DropdownBase from '@ui/dropdowns/base/DropdownBase';
import Breadcrumb from '@ui/navigation/breadcrumb/Breadcrumb';
import AppLink from '@ui/navigation/link/Link';
import { PageScope } from '@ui-constants/misc.constant';
import {
  buildPostAgentHref,
  buildPostAnalyticsHref,
} from '@utils/url/desktop-loop-url.util';
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
            <AppLink
              url={post.platformUrl}
              icon={<HiArrowTopRightOnSquare />}
              variant={ButtonVariant.SECONDARY}
              target="_blank"
            />
          )}

          {/* Expand to Thread dropdown - shown for editable Twitter posts without children */}
          {canExpandToThread && (
            <DropdownBase
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
            </DropdownBase>
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
            <AppLink
              url={buildPostAnalyticsHref(post.id)}
              label="Performance"
              variant={ButtonVariant.SECONDARY}
              icon={<HiChartBar className="h-4 w-4" />}
            />
          )}

          {canCreateRemix && (
            <AppLink
              url={buildPostAgentHref(getPostLabel(post))}
              label="Ask Agent"
              variant={ButtonVariant.SECONDARY}
              icon={<HiSparkles className="h-4 w-4" />}
            />
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
