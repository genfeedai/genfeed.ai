'use client';

import type { PlatformPreviewRendererProps } from '@genfeedai/props/components/platform-preview.props';
import CaptionText, {
  CharacterCounter,
  LinkPreviewCard,
  ThreadSegments,
  ValidationIssues,
} from '@ui/posts/platform-preview/PlatformPreviewCaption';
import MediaGrid from '@ui/posts/platform-preview/PlatformPreviewMedia';
import PreviewShell from '@ui/posts/platform-preview/PlatformPreviewShell';
import {
  Bookmark,
  Heart,
  MessageCircle,
  RefreshCw,
  Send,
  ThumbsUp,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function XPreviewRenderer({
  target,
}: PlatformPreviewRendererProps) {
  return (
    <PreviewShell target={target}>
      <div className="mb-2 flex justify-end">
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
    </PreviewShell>
  );
}

export function ThreadsPreviewRenderer({
  target,
}: PlatformPreviewRendererProps) {
  return (
    <PreviewShell target={target}>
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
    <PreviewShell accountMeta={translate('public')} target={target}>
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
    <PreviewShell accountMeta={translate('public')} target={target}>
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
    <PreviewShell target={target}>
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
