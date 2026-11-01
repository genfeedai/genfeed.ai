'use client';

import type {
  PlatformPreviewAuthorRowProps,
  PlatformPreviewRendererProps,
  PlatformPreviewShellProps,
} from '@genfeedai/props/components/platform-preview.props';
import Card from '@ui/card/Card';
import { PreviewPresentation } from '@ui/posts/platform-preview/PlatformPreview.context';
import { renderCaptionEntities } from '@ui/posts/platform-preview/PlatformPreviewCaption';
import {
  formatHandle,
  getAuthorName,
  getPreviewStatus,
} from '@ui/posts/platform-preview/platform-preview.helpers';
import { getPlatformPreviewIcon } from '@ui/posts/platform-preview/platform-preview-icons';
import { Avatar } from '@ui/primitives/avatar';
import { Badge } from '@ui/primitives/badge';
import { SimpleTooltip } from '@ui/primitives/tooltip';
import { useTranslations } from 'next-intl';
import { useContext } from 'react';

export default function PreviewShell({
  target,
  eyebrow,
  isApproximate = false,
  children,
  className,
}: PlatformPreviewShellProps) {
  const translate = useTranslations('ui.platformPreview');
  const { statusLabel, headerPresentation } = useContext(PreviewPresentation);
  const isAccountHeader = headerPresentation === 'account';
  const status = getPreviewStatus(target);
  const Icon = getPlatformPreviewIcon(target.platform);
  return (
    <article
      aria-label={translate('platformLabel', {
        platform: target.platformLabel,
      })}
    >
      <Card
        data-testid="preview-card"
        label={isAccountHeader ? undefined : target.platformLabel}
        labelAs="h2"
        isLabelWrapped
        icon={isAccountHeader ? undefined : <Icon className="size-4" />}
        description={
          isAccountHeader
            ? undefined
            : isApproximate
              ? translate('approximate')
              : eyebrow
        }
        className={className}
        headerAction={
          isAccountHeader ? undefined : (
            <Badge
              variant="outline"
              className={statusLabel ? 'status' : status.className}
            >
              {statusLabel || translate(status.messageKey)}
            </Badge>
          )
        }
      >
        {isAccountHeader ? (
          <div
            className="flex items-center justify-between gap-3"
            data-testid="preview-account-header"
          >
            <AuthorRow target={target} showPlatformBadge />
            <Badge
              variant="outline"
              className={statusLabel ? 'status' : status.className}
            >
              {statusLabel || translate(status.messageKey)}
            </Badge>
          </div>
        ) : null}
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

export function AuthorAvatar({ target }: PlatformPreviewRendererProps) {
  const translate = useTranslations('ui.platformPreview');
  return (
    <Avatar
      alt={translate('avatarAlt', { name: getAuthorName(target) })}
      name={getAuthorName(target)}
      referrerPolicy="no-referrer"
      size="lg"
      src={target.author?.avatarUrl}
    />
  );
}

export function AuthorRow({
  target,
  meta,
  showPlatformBadge = false,
}: PlatformPreviewAuthorRowProps) {
  const { headerPresentation } = useContext(PreviewPresentation);
  if (headerPresentation === 'account' && !showPlatformBadge) return null;
  const Icon = getPlatformPreviewIcon(target.platform);
  const authorName = getAuthorName(target);
  const handle = formatHandle(target.author?.handle);

  return (
    <div className="flex items-center gap-3">
      <span className="relative shrink-0">
        <AuthorAvatar target={target} />
        {showPlatformBadge ? (
          <SimpleTooltip label={target.platformLabel}>
            <span
              className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full border border-border bg-card text-foreground"
              role="img"
              aria-label={target.platformLabel}
            >
              <Icon className="size-3" />
            </span>
          </SimpleTooltip>
        ) : null}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">
          {authorName}
        </p>
        {handle || meta ? (
          <p className="truncate text-xs text-muted-foreground">
            {handle}
            {handle && meta ? <> · </> : null}
            {meta}
          </p>
        ) : null}
      </div>
    </div>
  );
}
