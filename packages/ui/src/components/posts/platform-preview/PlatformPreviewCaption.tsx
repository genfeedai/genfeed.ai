'use client';

import type { ChannelValidationIssue } from '@genfeedai/contracts/api-types/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type {
  PlatformPreviewCaptionProps,
  PlatformPreviewCharacterCounterProps,
  PlatformPreviewRendererProps,
} from '@genfeedai/props/components/platform-preview.props';
import { PreviewPresentation } from '@ui/posts/platform-preview/PlatformPreview.context';
import { getCaptionPreviewState } from '@ui/posts/platform-preview/PlatformPreview.data';
import { extractFirstUrl } from '@ui/posts/platform-preview/platform-preview.helpers';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { type ReactNode, useContext } from 'react';

const ENTITY_PATTERN = /(https?:\/\/[^\s]+|[@#][A-Za-z0-9_]+)/g;

export function renderCaptionEntities(text: string): ReactNode[] {
  return text.split(ENTITY_PATTERN).map((part, index) => {
    const key = `${part}-${index}`;
    if (part.match(ENTITY_PATTERN)) {
      return (
        <span
          key={key}
          data-testid="preview-entity"
          className="font-medium text-primary"
        >
          {part}
        </span>
      );
    }

    return part;
  });
}

export function CharacterCounter({
  state,
}: PlatformPreviewCharacterCounterProps) {
  return (
    <span
      className={cn(
        'text-xs tabular-nums',
        state.isOverLimit ? 'text-destructive' : 'text-muted-foreground',
      )}
    >
      {state.maxLength ? `${state.count}/${state.maxLength}` : state.count}
    </span>
  );
}

export default function CaptionText({
  target,
  emptyMessage,
}: PlatformPreviewCaptionProps) {
  const translate = useTranslations('ui.platformPreview');
  const text = target.captionState.previewText.trim();

  if (!text) {
    return (
      <p className="text-sm text-muted-foreground">
        {emptyMessage ?? translate('emptyCaption')}
      </p>
    );
  }

  return (
    <p className="description whitespace-pre-wrap break-words text-sm leading-6 text-foreground/90">
      {renderCaptionEntities(text)}
    </p>
  );
}

export function ValidationIssues({ target }: PlatformPreviewRendererProps) {
  const translate = useTranslations('ui.platformPreview');
  const { showValidation } = useContext(PreviewPresentation);
  if (showValidation === false) return null;
  const issues: ChannelValidationIssue[] = [
    ...target.validation.errors,
    ...target.validation.warnings,
  ];

  if (issues.length === 0 && !target.captionState.isOverLimit) {
    return null;
  }

  return (
    <div
      className="mt-3 border-t border-border pt-3"
      role={target.validation.errors.length > 0 ? 'alert' : 'status'}
    >
      <ul className="grid gap-1 text-xs text-foreground/70">
        {target.captionState.isOverLimit && target.captionState.maxLength ? (
          <li className="text-destructive">
            {translate('truncated', { count: target.captionState.maxLength })}
          </li>
        ) : null}
        {issues.map((issue) => (
          <li
            key={`${issue.severity}-${issue.code}-${issue.field ?? 'target'}`}
            className={
              issue.severity === 'error' ? 'text-destructive' : 'text-warning'
            }
          >
            {issue.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LinkPreviewCard({ target }: PlatformPreviewRendererProps) {
  const translate = useTranslations('ui.platformPreview');
  const url = target.linkPreview?.url ?? extractFirstUrl(target.caption);

  if (!url || !target.capability?.media.kinds.includes('link')) {
    return null;
  }

  const domain =
    target.linkPreview?.domain ??
    (() => {
      try {
        return new URL(url).hostname;
      } catch {
        return url;
      }
    })();

  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-border bg-background/10">
      {target.linkPreview?.imageUrl ? (
        <Image
          src={target.linkPreview.imageUrl}
          alt=""
          width={640}
          height={320}
          className="aspect-[2/1] w-full object-cover outline-media"
        />
      ) : (
        <div className="flex aspect-[2/1] items-center justify-center bg-muted text-xs text-muted-foreground">
          {translate('noLinkPreview')}
        </div>
      )}
      <div className="grid gap-1 p-3">
        <p className="text-xs uppercase text-muted-foreground">{domain}</p>
        <p className="line-clamp-2 text-sm font-medium text-foreground">
          {target.linkPreview?.title ?? translate('linkPending')}
        </p>
        {target.linkPreview?.description ? (
          <p className="line-clamp-2 text-xs text-foreground/60">
            {target.linkPreview.description}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function ThreadSegments({ target }: PlatformPreviewRendererProps) {
  const translate = useTranslations('ui.platformPreview');
  if (target.threadSegments.length <= 1) {
    return <CaptionText target={target} />;
  }

  return (
    <div className="grid gap-3">
      {target.threadSegments.map((segment, index) => {
        const state = getCaptionPreviewState(
          segment.caption,
          target.capability?.caption.maxLength,
        );

        return (
          <div key={segment.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground/70">
                {index + 1}
              </span>
              {index < target.threadSegments.length - 1 ? (
                <span className="mt-2 h-full min-h-8 w-px bg-border" />
              ) : null}
            </div>
            <div className="min-w-0 flex-1 rounded-lg border border-border bg-background/10 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-foreground/70">
                  {segment.label ??
                    translate('threadPost', { count: index + 1 })}
                </span>
                <CharacterCounter state={state} />
              </div>
              {segment.caption.trim() ? (
                <p className="description whitespace-pre-wrap break-words text-sm leading-6 text-foreground/90">
                  {renderCaptionEntities(state.previewText)}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {translate('emptyCaption')}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
