'use client';

import type { PlatformPreviewRendererProps } from '@genfeedai/props/components/platform-preview.props';
import { PreviewPresentation } from '@ui/posts/platform-preview/PlatformPreview.context';
import CaptionText, {
  CharacterCounter,
  LinkPreviewCard,
  ThreadSegments,
  ValidationIssues,
} from '@ui/posts/platform-preview/PlatformPreviewCaption';
import MediaGrid from '@ui/posts/platform-preview/PlatformPreviewMedia';
import PreviewShell, {
  AuthorAvatar,
  AuthorRow,
} from '@ui/posts/platform-preview/PlatformPreviewShell';
import {
  formatHandle,
  getAuthorName,
} from '@ui/posts/platform-preview/platform-preview.helpers';
import {
  Bookmark,
  Heart,
  MessageCircle,
  RefreshCw,
  Send,
  ThumbsUp,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useContext } from 'react';

export default function XPreviewRenderer({
  target,
}: PlatformPreviewRendererProps) {
  const translate = useTranslations('ui.platformPreview');
  const { headerPresentation } = useContext(PreviewPresentation);
  const isAccountHeader = headerPresentation === 'account';
  return (
    <PreviewShell eyebrow={translate('eyebrow.x')} target={target}>
      <div className="flex gap-3">
        {isAccountHeader ? null : <AuthorAvatar target={target} />}
        <div className="min-w-0 flex-1">
          <div
            className={
              isAccountHeader
                ? 'mb-2 flex justify-end'
                : 'mb-2 flex items-center justify-between gap-3'
            }
          >
            {isAccountHeader ? null : (
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">
                  {getAuthorName(target)}
                </p>
                {formatHandle(target.author?.handle) ? (
                  <p className="truncate text-xs text-muted-foreground">
                    {formatHandle(target.author?.handle)}
                  </p>
                ) : null}
              </div>
            )}
            <CharacterCounter state={target.captionState} />
          </div>
          <ThreadSegments target={target} />
          <div className={target.media.length ? 'mt-3' : undefined}>
            <MediaGrid target={target} />
          </div>
          <LinkPreviewCard target={target} />
          <div className="mt-4 flex justify-between text-muted-foreground">
            <MessageCircle className="size-4" />
            <RefreshCw className="size-4" />
            <Heart className="size-4" />
            <Bookmark className="size-4" />
          </div>
          <ValidationIssues target={target} />
        </div>
      </div>
    </PreviewShell>
  );
}

export function ThreadsPreviewRenderer({
  target,
}: PlatformPreviewRendererProps) {
  const translate = useTranslations('ui.platformPreview');
  return (
    <PreviewShell eyebrow={translate('eyebrow.threads')} target={target}>
      <AuthorRow target={target} />
      <div className="mt-3">
        <ThreadSegments target={target} />
      </div>
      <MediaGrid target={target} />
      <LinkPreviewCard target={target} />
      <div
        className="mt-4 flex items-center gap-4 text-muted-foreground"
        aria-hidden="true"
      >
        <Heart className="size-4" />
        <MessageCircle className="size-4" />
        <RefreshCw className="size-4" />
        <Send className="size-4" />
      </div>
      <div className="mt-2 flex justify-end">
        <CharacterCounter state={target.captionState} />
      </div>
      <ValidationIssues target={target} />
    </PreviewShell>
  );
}

export function LinkedInPreviewRenderer({
  target,
}: PlatformPreviewRendererProps) {
  const translate = useTranslations('ui.platformPreview');
  return (
    <PreviewShell eyebrow={translate('eyebrow.linkedin')} target={target}>
      <AuthorRow target={target} meta={translate('public')} />
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-xs font-medium uppercase text-muted-foreground">
          {translate('feedPost')}
        </span>
        <CharacterCounter state={target.captionState} />
      </div>
      <div className="mt-2">
        <ThreadSegments target={target} />
      </div>
      <MediaGrid target={target} />
      <LinkPreviewCard target={target} />
      <div className="mt-4 flex items-center gap-5 border-t border-border pt-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <ThumbsUp className="size-4" />
          {translate('like')}
        </span>
        <span className="inline-flex items-center gap-1">
          <MessageCircle className="size-4" />
          {translate('comment')}
        </span>
        <span className="inline-flex items-center gap-1">
          <Send className="size-4" />
          {translate('send')}
        </span>
      </div>
      <ValidationIssues target={target} />
    </PreviewShell>
  );
}

export function FacebookPreviewRenderer({
  target,
}: PlatformPreviewRendererProps) {
  const translate = useTranslations('ui.platformPreview');
  return (
    <PreviewShell eyebrow={translate('eyebrow.facebook')} target={target}>
      <AuthorRow target={target} meta={translate('public')} />
      <CaptionText target={target} />
      <MediaGrid target={target} />
      <LinkPreviewCard target={target} />
      <div
        className="mt-3 flex gap-5 border-t border-border pt-3 text-xs text-muted-foreground"
        aria-hidden="true"
      >
        <span className="inline-flex items-center gap-1">
          <ThumbsUp className="size-4" />
          {translate('like')}
        </span>
        <span className="inline-flex items-center gap-1">
          <MessageCircle className="size-4" />
          {translate('comment')}
        </span>
        <span className="inline-flex items-center gap-1">
          <Send className="size-4" />
          {translate('share')}
        </span>
      </div>
      <ValidationIssues target={target} />
    </PreviewShell>
  );
}

export function RedditPreviewRenderer({
  target,
}: PlatformPreviewRendererProps) {
  const translate = useTranslations('ui.platformPreview');
  return (
    <PreviewShell eyebrow={translate('eyebrow.reddit')} target={target}>
      <AuthorRow target={target} />
      {target.title ? (
        <h3 className="text-base font-semibold">{target.title}</h3>
      ) : null}
      <CaptionText target={target} />
      <MediaGrid target={target} />
      <LinkPreviewCard target={target} />
      <div
        className="mt-3 flex gap-4 text-xs text-muted-foreground"
        aria-hidden="true"
      >
        <span className="inline-flex items-center gap-1">
          <MessageCircle className="size-4" />
          {translate('comments')}
        </span>
        <span className="inline-flex items-center gap-1">
          <Send className="size-4" />
          {translate('share')}
        </span>
      </div>
      <ValidationIssues target={target} />
    </PreviewShell>
  );
}
