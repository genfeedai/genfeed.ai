'use client';
import { ButtonVariant, CredentialPlatform } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type {
  PlatformPreviewProps,
  PlatformPreviewRenderer,
} from '@genfeedai/props/components/platform-preview.props';
import { PreviewPresentation } from '@ui/posts/platform-preview/PlatformPreview.context';
import {
  buildPostTargets,
  DEFAULT_PLATFORM_PREVIEW_AUTHOR_HANDLE,
  DEFAULT_PLATFORM_PREVIEW_AUTHOR_NAME,
  getPlatformKey,
  resolvePlatformPreviewTarget,
  resolvePreviewPlatform,
} from '@ui/posts/platform-preview/PlatformPreview.data';
import GenericPlatformPreviewRenderer, {
  CompactPreviewRenderer,
} from '@ui/posts/platform-preview/PlatformPreviewFallback';
import XPreviewRenderer, {
  FacebookPreviewRenderer,
  LinkedInPreviewRenderer,
  RedditPreviewRenderer,
  ThreadsPreviewRenderer,
} from '@ui/posts/platform-preview/PlatformPreviewSocial';
import InstagramPreviewRenderer, {
  PinterestPreviewRenderer,
  TikTokPreviewRenderer,
  YouTubePreviewRenderer,
} from '@ui/posts/platform-preview/PlatformPreviewVisual';
import { formatHandle } from '@ui/posts/platform-preview/platform-preview.helpers';
import { getPlatformPreviewIcon } from '@ui/posts/platform-preview/platform-preview-icons';
import { Button } from '@ui/primitives/button';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

export type {
  PlatformPreviewAuthor,
  PlatformPreviewIcon,
  PlatformPreviewLinkCard,
  PlatformPreviewMedia,
  PlatformPreviewProps,
  PlatformPreviewRenderer,
  PlatformPreviewRendererProps,
  PlatformPreviewTarget,
  PlatformPreviewThreadSegment,
} from '@genfeedai/props/components/platform-preview.props';
export {
  GENERIC_PLATFORM_PREVIEW_ICON,
  getPlatformPreviewIcon,
  PLATFORM_PREVIEW_ICONS,
} from '@ui/posts/platform-preview/platform-preview-icons';
export {
  buildMediaFromIngredients,
  countPreviewCharacters,
  getCaptionPreviewState,
  resolvePlatformPreviewTarget,
} from './PlatformPreview.data';

export const PLATFORM_PREVIEW_RENDERERS: Partial<
  Record<CredentialPlatform, PlatformPreviewRenderer>
> = {
  [CredentialPlatform.FACEBOOK]: FacebookPreviewRenderer,
  [CredentialPlatform.PINTEREST]: PinterestPreviewRenderer,
  [CredentialPlatform.REDDIT]: RedditPreviewRenderer,
  [CredentialPlatform.INSTAGRAM]: InstagramPreviewRenderer,
  [CredentialPlatform.LINKEDIN]: LinkedInPreviewRenderer,
  [CredentialPlatform.TIKTOK]: TikTokPreviewRenderer,
  [CredentialPlatform.TWITTER]: XPreviewRenderer,
  [CredentialPlatform.THREADS]: ThreadsPreviewRenderer,
  [CredentialPlatform.YOUTUBE]: YouTubePreviewRenderer,
};

export function hasDedicatedPlatformPreviewRenderer(
  platform: CredentialPlatform | string,
): boolean {
  const resolvedPlatform = resolvePreviewPlatform(platform);
  return Boolean(
    resolvedPlatform && PLATFORM_PREVIEW_RENDERERS[resolvedPlatform],
  );
}

export function getPlatformPreviewRenderer(
  platform: CredentialPlatform | string,
): PlatformPreviewRenderer {
  const resolvedPlatform = resolvePreviewPlatform(platform);

  return (
    (resolvedPlatform && PLATFORM_PREVIEW_RENDERERS[resolvedPlatform]) ||
    GenericPlatformPreviewRenderer
  );
}

export default function PlatformPreview({
  post,
  target,
  targets,
  accountName = DEFAULT_PLATFORM_PREVIEW_AUTHOR_NAME,
  accountHandle = DEFAULT_PLATFORM_PREVIEW_AUTHOR_HANDLE,
  activePlatform,
  className,
  emptyMessage,
  renderMedia,
  statusLabel,
  showValidation,
  presentation = 'full',
  headerPresentation = 'platform',
}: PlatformPreviewProps) {
  const translate = useTranslations('ui.platformPreview');
  const resolvedTargets = useMemo(() => {
    const previewTargets =
      targets ??
      (target
        ? [target]
        : post
          ? buildPostTargets(post, accountName, accountHandle)
          : []);

    return previewTargets.map((item, index) => ({
      ...resolvePlatformPreviewTarget(item),
      id: item.id ?? `${getPlatformKey(item.platform)}:${index}`,
    }));
  }, [accountHandle, accountName, post, target, targets]);

  const [selectedTargetId, setSelectedTargetId] = useState<string>();

  useEffect(() => {
    const current = resolvedTargets.find(
      (item) => item.id === selectedTargetId,
    );
    const requestedPlatform = activePlatform
      ? getPlatformKey(activePlatform)
      : undefined;
    if (
      current &&
      (!requestedPlatform ||
        getPlatformKey(current.platform) === requestedPlatform)
    )
      return;
    const preferred =
      resolvedTargets.find(
        (item) => getPlatformKey(item.platform) === requestedPlatform,
      ) ?? resolvedTargets[0];
    setSelectedTargetId(preferred?.id);
  }, [activePlatform, resolvedTargets, selectedTargetId]);

  if (resolvedTargets.length === 0) {
    return (
      <section className={cn('rounded-lg border border-border p-4', className)}>
        <p className="text-sm text-muted-foreground">
          {emptyMessage ?? translate('empty')}
        </p>
      </section>
    );
  }

  const activeTarget =
    resolvedTargets.find((item) => item.id === selectedTargetId) ??
    resolvedTargets[0];
  const Renderer = getPlatformPreviewRenderer(activeTarget.platform);

  return (
    <section
      className={cn('space-y-4', className)}
      aria-label={translate('label')}
    >
      {resolvedTargets.length > 1 ? (
        <div className="flex flex-wrap gap-1">
          {resolvedTargets.map((item) => {
            const itemKey = item.id;
            const Icon = getPlatformPreviewIcon(item.platform);
            const isSelected = itemKey === activeTarget.id;
            const hasMultipleAccounts =
              resolvedTargets.filter(
                (candidate) =>
                  getPlatformKey(candidate.platform) ===
                  getPlatformKey(item.platform),
              ).length > 1;

            return (
              <Button
                key={itemKey}
                type="button"
                withWrapper={false}
                variant={ButtonVariant.UNSTYLED}
                aria-pressed={isSelected}
                onClick={() => setSelectedTargetId(itemKey)}
                className={cn(
                  'inline-flex h-8 items-center gap-2 rounded-lg border px-2.5 text-xs font-medium transition',
                  isSelected
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:bg-hover hover:text-foreground',
                )}
              >
                <Icon className="size-3.5" />
                {item.platformLabel}
                {hasMultipleAccounts ? (
                  <span className="text-muted-foreground">
                    {item.author?.handle
                      ? formatHandle(item.author.handle)
                      : item.author?.name ||
                        translate('account', {
                          count: resolvedTargets.indexOf(item) + 1,
                        })}
                  </span>
                ) : null}
              </Button>
            );
          })}
        </div>
      ) : null}

      <PreviewPresentation.Provider
        value={{
          renderMedia,
          statusLabel,
          showValidation,
          presentation,
          headerPresentation,
        }}
      >
        {presentation === 'compact' ? (
          <CompactPreviewRenderer target={activeTarget} />
        ) : (
          <Renderer target={activeTarget} />
        )}
      </PreviewPresentation.Provider>
    </section>
  );
}
