'use client';

import type { PreviewMediaAspect } from '@genfeedai/contracts/constants/platform-limits.constant';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { getPlatformIcon } from '@genfeedai/helpers/ui/platform-icon/platform-icon.helper';
import type { TargetPreviewCredential } from '@genfeedai/props/ui/previews.props';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import {
  type CaptionPreviewState,
  getAuthorHandle,
  getAuthorName,
} from './preview.helpers';

const ENTITY_PATTERN = /(https?:\/\/[^\s]+|[@#][A-Za-z0-9_]+)/g;

const MEDIA_ASPECT_CLASSNAME: Record<PreviewMediaAspect, string> = {
  '1:1': 'aspect-square',
  '4:5': 'aspect-[4/5]',
  '9:16': 'aspect-[9/16]',
  '16:9': 'aspect-video',
};

export function getMediaAspectClassName(aspect: PreviewMediaAspect): string {
  return MEDIA_ASPECT_CLASSNAME[aspect];
}

/** Splits caption text so `@mentions`, `#hashtags`, and URLs render highlighted. */
export function renderCaptionEntities(text: string): ReactNode[] {
  return text.split(ENTITY_PATTERN).map((part, index) => {
    const key = `${part}-${index}`;
    if (part.match(ENTITY_PATTERN)) {
      return (
        <span
          key={key}
          className="font-medium text-primary"
          data-testid="preview-entity"
        >
          {part}
        </span>
      );
    }

    return part;
  });
}

export function CharacterCounter({ state }: { state: CaptionPreviewState }) {
  return (
    <span
      className={cn(
        'text-xs tabular-nums',
        state.isTruncated ? 'text-destructive' : 'text-foreground/45',
      )}
    >
      {state.maxLength ? `${state.count}/${state.maxLength}` : state.count}
    </span>
  );
}

export function CaptionText({ text }: { text: string }) {
  const trimmed = text.trim();
  const translate = useTranslations('common.previews');

  if (!trimmed) {
    return (
      <p className="text-sm text-foreground/35">{translate('emptyCaption')}</p>
    );
  }

  return (
    <p className="whitespace-pre-wrap text-sm leading-6 text-foreground/85">
      {renderCaptionEntities(trimmed)}
    </p>
  );
}

export function FirstCommentBlock({ comment }: { comment?: string }) {
  const translate = useTranslations('common.previews');

  if (!comment) {
    return null;
  }

  return (
    <div
      className="mt-3 border-t border-white/10 pt-3"
      data-testid="preview-first-comment"
    >
      <p className="mb-1 text-2xs uppercase tracking-wide text-foreground/45">
        {translate('firstComment')}
      </p>
      <p className="whitespace-pre-wrap text-sm text-foreground/70">
        {renderCaptionEntities(comment)}
      </p>
    </div>
  );
}

export interface PreviewShellProps {
  platform: string;
  credential: TargetPreviewCredential;
  eyebrow?: string;
  className?: string;
  children: ReactNode;
}

export default function PreviewShell({
  platform,
  credential,
  eyebrow,
  className,
  children,
}: PreviewShellProps) {
  const authorName = getAuthorName(credential);
  const authorHandle = getAuthorHandle(credential);

  return (
    <article
      aria-label={`${platform} platform preview`}
      className={cn(
        'overflow-hidden rounded-xl border border-border bg-background/40',
        className,
      )}
    >
      <header className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        {getPlatformIcon(platform, 'size-5')}
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium text-foreground">
            {authorName}
          </span>
          {eyebrow ? (
            <span className="truncate text-xs text-foreground/45">
              {eyebrow}
            </span>
          ) : (
            <span className="truncate text-xs text-foreground/45">
              {authorHandle}
            </span>
          )}
        </div>
      </header>
      <div className="p-4">{children}</div>
    </article>
  );
}
