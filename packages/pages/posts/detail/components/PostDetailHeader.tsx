'use client';

import {
  ButtonVariant,
  CredentialPlatform,
  PageScope,
  PostStatus,
} from '@genfeedai/contracts';
import type { IPost } from '@genfeedai/contracts/interfaces';
import type { CollectionOverflowAction } from '@genfeedai/props/ui/collection/collection.props';
import { getPostsPlatformLabel } from '@helpers/content/posts.helper';
import { stripHtmlToPlainText } from '@helpers/security/sanitize-html.helper';
import CollectionItemActions from '@ui/collection/CollectionItemActions';
import { Button } from '@ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import {
  buildPostAgentHref,
  buildPostAnalyticsHref,
} from '@utils/url/desktop-loop-url.util';
import {
  CalendarClock,
  ChartColumn,
  Copy,
  ExternalLink,
  Eye,
  List,
  Pencil,
  Repeat2,
  Send,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

export interface PostDetailHeaderProps {
  post: IPost;
  scope: PageScope;
  isPublished: boolean;
  hasChildren: boolean;
  viewMode: 'edit' | 'preview';
  headingLevel?: 1 | 2;
  showViewModeToggle?: boolean;
  isExpandingToThread?: boolean;
  onViewModeChange: (mode: 'edit' | 'preview') => void;
  onDelete: () => void;
  onCreateRemix?: () => void;
  onDuplicate?: () => void;
  onExpandToThread?: (count: 2 | 3 | 5) => void;
  onRepurpose?: () => void;
  /** Immediate publish — the primary action for an unscheduled draft. */
  onPublishNow?: () => void;
  /** Commits the schedule draft — the primary action once a date is picked. */
  onScheduleSave?: () => void;
  isScheduleDirty?: boolean;
  isSavingSchedule?: boolean;
}

function getPostLabel(post: IPost): string {
  const label = stripHtmlToPlainText(post.label);
  if (label) {
    return label;
  }

  const description = stripHtmlToPlainText(post.description);
  if (description) {
    return description;
  }

  return post.platform ? getPostsPlatformLabel(post.platform) : 'Post';
}

const THREAD_LENGTH_OPTIONS = [2, 3, 5] as const;

export default function PostDetailHeader({
  post,
  scope,
  isPublished,
  hasChildren,
  viewMode,
  headingLevel = 2,
  showViewModeToggle = true,
  isExpandingToThread = false,
  onViewModeChange,
  onDelete,
  onCreateRemix,
  onDuplicate: _onDuplicate,
  onExpandToThread,
  onRepurpose,
  onPublishNow,
  onScheduleSave,
  isScheduleDirty = false,
  isSavingSchedule = false,
}: PostDetailHeaderProps) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  const translate = useTranslations('pages.posts.detail.header');
  const [isThreadDialogOpen, setIsThreadDialogOpen] = useState(false);
  const isEditable = scope === PageScope.PUBLISHING && !isPublished;
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
    Boolean(onExpandToThread);

  // Publish/Schedule by state: a dirty schedule draft commits the picked
  // date, otherwise the primary action publishes immediately. A published
  // post has nothing left to publish, so it carries no primary action.
  const primary = useMemo(() => {
    if (isPublished) {
      return undefined;
    }
    if (isScheduleDirty && onScheduleSave) {
      return (
        <Button
          icon={<CalendarClock className="size-4" />}
          isDisabled={isSavingSchedule}
          isLoading={isSavingSchedule}
          label={
            isSavingSchedule ? translate('scheduling') : translate('schedule')
          }
          onClick={onScheduleSave}
          variant={ButtonVariant.DEFAULT}
        />
      );
    }
    if (onPublishNow) {
      return (
        <Button
          icon={<Send className="size-4" />}
          isDisabled={isSavingSchedule}
          isLoading={isSavingSchedule}
          label={
            isSavingSchedule ? translate('publishing') : translate('publishNow')
          }
          onClick={onPublishNow}
          variant={ButtonVariant.DEFAULT}
        />
      );
    }
    return undefined;
  }, [
    isPublished,
    isSavingSchedule,
    isScheduleDirty,
    onPublishNow,
    onScheduleSave,
    translate,
  ]);

  const overflow = useMemo(() => {
    const actions: CollectionOverflowAction[] = [];

    if (post.platformUrl) {
      actions.push({
        href: post.platformUrl,
        icon: <ExternalLink className="size-4" />,
        id: 'view-live-post',
        isExternal: true,
        label: translate('viewLivePost'),
      });
    }

    if (canExpandToThread) {
      actions.push({
        icon: <List className="size-4" />,
        id: 'expand-to-thread',
        isDisabled: isExpandingToThread,
        label: isExpandingToThread
          ? translate('expandingToThread')
          : translate('expandToThread'),
        onSelect: () => setIsThreadDialogOpen(true),
      });
    }

    if (canCreateRemix && onCreateRemix) {
      actions.push({
        icon: <Copy className="size-4" />,
        id: 'remix',
        label: translate('remix'),
        onSelect: onCreateRemix,
      });
    }

    if (onRepurpose) {
      actions.push({
        icon: <Repeat2 className="size-4" />,
        id: 'repurpose',
        label: translate('repurpose'),
        onSelect: onRepurpose,
      });
    }

    if (canCreateRemix) {
      actions.push({
        href: buildPostAnalyticsHref(post.id),
        icon: <ChartColumn className="size-4" />,
        id: 'performance',
        label: translate('performance'),
      });
      actions.push({
        href: buildPostAgentHref(getPostLabel(post)),
        icon: <Sparkles className="size-4" />,
        id: 'ask-agent',
        label: translate('askAgent'),
      });
    }

    if (isEditable) {
      if (showViewModeToggle) {
        actions.push({
          icon:
            viewMode === 'edit' ? (
              <Eye className="size-4" />
            ) : (
              <Pencil className="size-4" />
            ),
          id: 'toggle-view-mode',
          label: viewMode === 'edit' ? translate('preview') : translate('edit'),
          onSelect: () =>
            onViewModeChange(viewMode === 'edit' ? 'preview' : 'edit'),
        });
      }

      actions.push({
        icon: <Trash2 className="size-4" />,
        id: 'delete',
        isDestructive: true,
        label: translate('delete'),
        onSelect: onDelete,
      });
    }

    return actions;
  }, [
    canCreateRemix,
    canExpandToThread,
    isEditable,
    isExpandingToThread,
    onCreateRemix,
    onDelete,
    onRepurpose,
    onViewModeChange,
    post,
    showViewModeToggle,
    translate,
    viewMode,
  ]);

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div>
        <p className="text-sm text-foreground/60">Post detail</p>
        <Heading className="text-2xl font-bold">{getPostLabel(post)}</Heading>
      </div>

      <CollectionItemActions overflow={overflow} primary={primary} />

      {canExpandToThread ? (
        <Dialog onOpenChange={setIsThreadDialogOpen} open={isThreadDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{translate('threadLengthPrompt')}</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-1">
              {THREAD_LENGTH_OPTIONS.map((count) => (
                <Button
                  className="w-full justify-start text-left"
                  isDisabled={isExpandingToThread}
                  key={count}
                  onClick={() => {
                    setIsThreadDialogOpen(false);
                    onExpandToThread?.(count);
                  }}
                  variant={ButtonVariant.SECONDARY}
                  withWrapper={false}
                >
                  {translate('threadLengthOption', { count })}
                </Button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
