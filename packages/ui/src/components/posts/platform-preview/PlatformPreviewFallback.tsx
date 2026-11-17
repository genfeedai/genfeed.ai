'use client';

import { CredentialPlatform } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { PlatformPreviewRendererProps } from '@genfeedai/props/components/platform-preview.props';
import CaptionText, {
  CharacterCounter,
  LinkPreviewCard,
  ValidationIssues,
} from '@ui/posts/platform-preview/PlatformPreviewCaption';
import MediaGrid, {
  MediaTile,
} from '@ui/posts/platform-preview/PlatformPreviewMedia';
import PreviewShell, {
  AuthorRow,
} from '@ui/posts/platform-preview/PlatformPreviewShell';
import { getPreviewStatus } from '@ui/posts/platform-preview/platform-preview.helpers';
import { Badge } from '@ui/primitives/badge';
import { useTranslations } from 'next-intl';

export default function GenericPlatformPreviewRenderer({
  target,
}: PlatformPreviewRendererProps) {
  const translate = useTranslations('ui.platformPreview');
  return (
    <PreviewShell target={target}>
      <div className="flex items-center justify-end">
        <CharacterCounter state={target.captionState} />
      </div>
      <div className="mt-2">
        <CaptionText target={target} />
      </div>
      <MediaGrid target={target} />
      <LinkPreviewCard target={target} />
      {target.capability ? (
        <div className="mt-3 grid gap-1 text-xs text-muted-foreground">
          <p>
            {translate('mediaKinds', {
              kinds: target.capability.media.kinds.join(', '),
            })}
            {target.capability.media.maxItems
              ? translate('mediaLimit', {
                  count: target.capability.media.maxItems,
                })
              : ''}
          </p>
          <p>
            {translate('capabilityStatus', {
              status: target.capability.status,
            })}
          </p>
        </div>
      ) : null}
      <ValidationIssues target={target} />
    </PreviewShell>
  );
}

export function CompactPreviewRenderer({
  target,
}: PlatformPreviewRendererProps) {
  const translate = useTranslations('ui.platformPreview');
  const status = getPreviewStatus(target);
  const isVertical =
    target.platform === CredentialPlatform.TIKTOK ||
    target.platform === CredentialPlatform.INSTAGRAM;
  return (
    <article className="space-y-3" aria-label={target.platformLabel}>
      <div className="flex items-center justify-between gap-3">
        <AuthorRow target={target} />
        <Badge variant="outline" className={cn('shrink-0', status.className)}>
          {translate(status.messageKey)}
        </Badge>
      </div>
      {target.media[0] ? (
        <MediaTile
          key={target.media[0].id}
          item={target.media[0]}
          index={0}
          className={
            isVertical
              ? 'mx-auto aspect-[9/16] h-52 min-h-0'
              : 'aspect-video min-h-0 w-full'
          }
        />
      ) : null}
      {target.title?.trim() ? (
        <p className="line-clamp-2 text-sm font-medium">{target.title}</p>
      ) : null}
      <div className="line-clamp-3">
        <CaptionText target={target} />
      </div>
    </article>
  );
}
