'use client';

import type { PlatformPreviewRendererProps } from '@genfeedai/props/components/platform-preview.props';
import CaptionText, {
  CharacterCounter,
  LinkPreviewCard,
  renderCaptionEntities,
  ValidationIssues,
} from '@ui/posts/platform-preview/PlatformPreviewCaption';
import MediaGrid from '@ui/posts/platform-preview/PlatformPreviewMedia';
import PreviewShell, {
  AuthorRow,
} from '@ui/posts/platform-preview/PlatformPreviewShell';
import {
  formatHandle,
  getAuthorName,
} from '@ui/posts/platform-preview/platform-preview.helpers';
import { Bookmark, Heart, MessageCircle, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function InstagramPreviewRenderer({
  target,
}: PlatformPreviewRendererProps) {
  const translate = useTranslations('ui.platformPreview');
  return (
    <PreviewShell eyebrow={translate('eyebrow.instagram')} target={target}>
      <AuthorRow target={target} />
      <MediaGrid target={target} variant="square" />
      <div className="mt-3 flex items-center gap-4 text-foreground/70">
        <Heart className="size-5" />
        <MessageCircle className="size-5" />
        <Send className="size-5" />
        <Bookmark className="ml-auto size-5" />
      </div>
      <div className="mt-3 flex items-start justify-between gap-3">
        <p className="description min-w-0 whitespace-pre-wrap break-words text-sm leading-6 text-foreground/85">
          <span className="font-semibold">{getAuthorName(target)}</span>{' '}
          {target.captionState.previewText.trim()
            ? renderCaptionEntities(target.captionState.previewText)
            : translate('emptyCaption')}
        </p>
        <CharacterCounter state={target.captionState} />
      </div>
      <ValidationIssues target={target} />
    </PreviewShell>
  );
}

export function TikTokPreviewRenderer({
  target,
}: PlatformPreviewRendererProps) {
  const translate = useTranslations('ui.platformPreview');
  return (
    <PreviewShell eyebrow={translate('eyebrow.tiktok')} target={target}>
      <AuthorRow target={target} />
      <div
        className={
          'relative mx-auto max-w-72 overflow-hidden rounded-lg border border-border bg-black' /* design-system-allow-content-color -- platform preview */
        }
      >
        <MediaGrid target={target} variant="vertical" />
        <div
          className={
            'pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-4 text-white' /* design-system-allow-content-color -- platform preview */
          }
        >
          <p className="text-sm font-semibold">
            {formatHandle(target.author?.handle) ?? getAuthorName(target)}
          </p>
          <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm leading-5">
            {target.captionState.previewText.trim()
              ? renderCaptionEntities(target.captionState.previewText)
              : translate('emptyCaption')}
          </p>
          <div
            className={
              'mt-3 flex items-center justify-between text-xs text-white/70' /* design-system-allow-content-color -- platform preview */
            }
          >
            <span>{target.platformLabel}</span>
            <span className="tabular-nums">
              {target.captionState.maxLength
                ? `${target.captionState.count}/${target.captionState.maxLength}`
                : target.captionState.count}
            </span>
          </div>
        </div>
      </div>
      <ValidationIssues target={target} />
    </PreviewShell>
  );
}

export function YouTubePreviewRenderer({
  target,
}: PlatformPreviewRendererProps) {
  const translate = useTranslations('ui.platformPreview');
  return (
    <PreviewShell eyebrow={translate('eyebrow.youtube')} target={target}>
      <AuthorRow target={target} />
      <MediaGrid target={target} variant="video" />
      <div className="mt-3">
        <h3 className="line-clamp-2 text-base font-semibold text-foreground">
          {target.title?.trim() || translate('untitledVideo')}
        </h3>
        <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>{getAuthorName(target)}</span>
          <CharacterCounter state={target.captionState} />
        </div>
      </div>
      <div className="mt-3 rounded-lg bg-muted/35 p-3">
        <CaptionText
          target={target}
          emptyMessage={translate('emptyDescription')}
        />
      </div>
      <ValidationIssues target={target} />
    </PreviewShell>
  );
}

export function PinterestPreviewRenderer({
  target,
}: PlatformPreviewRendererProps) {
  const translate = useTranslations('ui.platformPreview');
  return (
    <PreviewShell eyebrow={translate('eyebrow.pinterest')} target={target}>
      <MediaGrid target={target} variant="square" />
      {target.title ? (
        <h3 className="text-base font-semibold">{target.title}</h3>
      ) : null}
      <AuthorRow target={target} />
      <CaptionText target={target} />
      <LinkPreviewCard target={target} />
      <ValidationIssues target={target} />
    </PreviewShell>
  );
}
