'use client';

import type {
  PlatformPreviewAuthorRowProps,
  PlatformPreviewShellProps,
} from '@genfeedai/props/components/platform-preview.props';
import Card from '@ui/card/Card';
import ConnectedAccount from '@ui/display/connected-account/ConnectedAccount';
import { PreviewPresentation } from '@ui/posts/platform-preview/PlatformPreview.context';
import { renderCaptionEntities } from '@ui/posts/platform-preview/PlatformPreviewCaption';
import {
  getAuthorName,
  getPreviewStatus,
} from '@ui/posts/platform-preview/platform-preview.helpers';
import { Badge } from '@ui/primitives/badge';
import { useTranslations } from 'next-intl';
import { useContext } from 'react';

export default function PreviewShell({
  target,
  accountMeta,
  children,
  className,
}: PlatformPreviewShellProps) {
  const translate = useTranslations('ui.platformPreview');
  const { statusLabel, headerAction } = useContext(PreviewPresentation);
  const status = getPreviewStatus(target);
  return (
    <article
      aria-label={translate('platformLabel', {
        platform: target.platformLabel,
      })}
    >
      <Card data-testid="preview-card" isHeaderInside className={className}>
        <div
          className="flex items-center justify-between gap-3"
          data-testid="preview-account-header"
        >
          <AuthorRow meta={accountMeta} target={target} />
          <div className="flex shrink-0 items-center gap-1.5">
            <Badge
              variant="outline"
              className={statusLabel ? 'status' : status.className}
            >
              {statusLabel || translate(status.messageKey)}
            </Badge>
            {headerAction}
          </div>
        </div>
        {children}
        {target.firstComment?.trim() ? (
          <div
            className="mt-3 border-t border-border pt-3"
            data-testid="preview-first-comment"
          >
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              {translate('firstComment')}
            </p>
            <p className="whitespace-pre-wrap text-sm text-foreground">
              {renderCaptionEntities(target.firstComment)}
            </p>
          </div>
        ) : null}
      </Card>
    </article>
  );
}

export function AuthorRow({ target, meta }: PlatformPreviewAuthorRowProps) {
  return (
    <ConnectedAccount
      account={{
        avatarUrl: target.author?.avatarUrl,
        handle: target.author?.handle,
        name: getAuthorName(target),
        platform: target.platform,
      }}
      layout="stacked"
      meta={meta}
      size="lg"
    />
  );
}
