'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { AlertCategory, ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createPublishingPostsFilterRoute,
} from '@genfeedai/contracts/constants';
import type { StoryboardRunPanelProps } from '@genfeedai/props/studio/storyboard.props';
import { ClipboardService } from '@genfeedai/services/core/clipboard.service';
import { useAvatarImages } from '@hooks/data/ingredients/use-avatar-images/use-avatar-images';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useVoiceCatalog } from '@pages/library/voices/hooks/use-voice-catalog';
import StoryboardRunScenes from '@pages/studio/storyboard/components/StoryboardRunScenes';
import { useStoryboardAssets } from '@pages/studio/storyboard/hooks/use-storyboard-assets';
import { resolvePairedRunIdentity } from '@pages/studio/storyboard/utils/storyboard-run';
import Badge from '@ui/display/badge/Badge';
import Alert from '@ui/feedback/alert/Alert';
import { Button } from '@ui/primitives/button';
import { getIngredientDisplayLabel } from '@utils/media/ingredient-type.util';
import { Copy, GitBranch, Megaphone, Send, Sparkles } from 'lucide-react';
import NextImage from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';

function formatLabel(value: string): string {
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function StoryboardRunPanel({
  error,
  sceneActions,
  isWorking,
  onPreparePaidDraft,
  onReview,
  onVary,
  run,
}: StoryboardRunPanelProps): ReactElement {
  const { organizationId } = useBrand();
  const { avatars } = useAvatarImages(organizationId);
  const { voices } = useVoiceCatalog({ isActive: true });
  const assets = useStoryboardAssets(
    `${run.id}:${run.revision}`,
    run.brandId,
    (run.execution?.variants ?? []).flatMap((variant) =>
      variant.assetIds.map((id) => ({
        id,
        kind:
          run.draft.output.kind === 'image'
            ? ('image' as const)
            : ('video' as const),
      })),
    ),
  );
  const translate = useTranslations('pages.studioStoryboard');
  const { activeHref } = useOrgUrl();
  const readyVariantIds =
    run.execution?.variants
      .filter((variant) => variant.status === 'ready')
      .map((variant) => variant.id) ?? [];
  const patternEntries = Object.entries(run.sourceSnapshot.pattern).filter(
    (entry): entry is [string, string] => Boolean(entry[1]),
  );
  const isPaidMeta =
    run.draft.target.kind === 'paid' && run.draft.target.platform === 'meta';
  const canonicalIdentity = resolvePairedRunIdentity(run.draft.identity);
  const isMetaHandoffEligible =
    isPaidMeta &&
    run.phase === 'approved' &&
    Boolean(run.review?.approvedPostIds.length) &&
    !run.paidDraft;
  const hasConnectedMetaSource =
    run.sourceSnapshot.selector.kind === 'connected_ad' &&
    run.sourceSnapshot.selector.platform === 'meta';
  const canPrepareMetaDraft =
    isMetaHandoffEligible &&
    hasConnectedMetaSource &&
    Boolean(onPreparePaidDraft);
  const isMetaHandoffUnavailable =
    isMetaHandoffEligible && !canPrepareMetaDraft;
  const hasApprovedOrganicDrafts =
    run.draft.target.kind === 'organic' &&
    run.phase === 'approved' &&
    Boolean(run.review?.approvedPostIds.length);
  const outputSummary = [
    formatLabel(run.draft.target.kind),
    formatLabel(run.draft.target.platform),
    formatLabel(run.draft.output.kind),
    'aspectRatio' in run.draft.output
      ? run.draft.output.aspectRatio
      : undefined,
  ]
    .filter(Boolean)
    .join(' · ');
  const clipboardService = ClipboardService.getInstance();
  const copyVariantGroup = (
    variantId: string,
    content: string | undefined,
    assetIds: string[],
  ): void => {
    const group = [
      content ?? run.draft.intent.objective,
      '',
      ...assetIds.map((assetId) => `• ${assetId}`),
    ].join('\n');
    void clipboardService.copyToClipboard(`${variantId}\n${group}`);
  };

  return (
    <section
      aria-label={translate('run.regionLabel')}
      className="space-y-4 border-y border-border bg-card/40 p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{formatLabel(run.phase)}</Badge>
            <Badge variant="ghost">{run.brand.name}</Badge>
            <span className="text-xs text-muted-foreground">
              {translate('run.recipeRevision', {
                recipeVersion: run.recipeVersion,
                revision: run.revision,
              })}
            </span>
          </div>
          <h2 className="mt-2 text-sm font-semibold text-foreground">
            {run.sourceSnapshot.title}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">{outputSummary}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {run.execution ? (
            <Button
              icon={<GitBranch className="size-4" />}
              isDisabled={isWorking}
              label={translate('run.varyRecipe')}
              onClick={onVary}
              size={ButtonSize.SM}
              variant={ButtonVariant.SECONDARY}
            />
          ) : null}
          {readyVariantIds.length > 0 && !run.review ? (
            <Button
              icon={<Send className="size-4" />}
              isDisabled={isWorking}
              label={translate('run.sendToReview', {
                count: readyVariantIds.length,
              })}
              onClick={() => onReview(readyVariantIds)}
              size={ButtonSize.SM}
              variant={ButtonVariant.DEFAULT}
            />
          ) : null}
        </div>
      </div>

      {sceneActions && ['video', 'avatar'].includes(run.draft.output.kind) ? (
        <StoryboardRunScenes
          run={run}
          actions={sceneActions}
          isWorking={isWorking}
        />
      ) : null}

      {error ? <Alert type={AlertCategory.ERROR}>{error}</Alert> : null}

      {run.readiness.state !== 'ready' ? (
        <Alert
          type={
            run.readiness.state === 'blocked'
              ? AlertCategory.ERROR
              : AlertCategory.WARNING
          }
        >
          <div className="space-y-1">
            <p className="font-medium">
              {translate('run.readinessTitle', {
                state: formatLabel(run.readiness.state),
              })}
            </p>
            {run.readiness.issues.map((issue) => (
              <p className="text-xs" key={`${issue.code}:${issue.field}`}>
                {issue.message}
              </p>
            ))}
          </div>
        </Alert>
      ) : null}

      {patternEntries.length ? (
        <dl className="grid gap-2 text-xs sm:grid-cols-2">
          {patternEntries.map(([key, value]) => (
            <div className="flex gap-2" key={key}>
              <dt className="text-muted-foreground">{formatLabel(key)}</dt>
              <dd className="text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {canonicalIdentity ? (
        <div
          aria-label={translate('run.identity.label')}
          className="flex flex-wrap gap-2"
          role="group"
        >
          <Badge variant="secondary">
            {translate('run.identity.avatar', {
              id:
                avatars.find(
                  (item) =>
                    item.id === canonicalIdentity.avatarAssetId &&
                    item.brandId === run.brandId,
                )?.metadataLabel || '—',
            })}
          </Badge>
          <Badge variant="secondary">
            {translate('run.identity.voice', {
              id:
                voices.find(
                  (item) =>
                    item.id === canonicalIdentity.speechVoiceId &&
                    item.brandId === run.brandId,
                )?.metadataLabel || '—',
            })}
          </Badge>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {run.draft.references.map((reference) => (
          <Badge key={`${reference.assetId}:${reference.role}`} variant="ghost">
            {formatLabel(reference.role)} · {formatLabel(reference.source)}
          </Badge>
        ))}
      </div>

      {run.execution?.variants.length ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {translate('run.outputCount', {
              actual: run.execution.actualCount,
              requested: run.execution.requestedCount,
            })}
          </p>
          {run.execution.partialReason ? (
            <Alert type={AlertCategory.WARNING}>
              {run.execution.partialReason}
            </Alert>
          ) : null}
          <div className="divide-y divide-border border-y border-border">
            {run.execution.variants.map((variant, index) => (
              <div
                className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs"
                key={variant.id}
              >
                <div className="min-w-0">
                  <p className="font-medium text-foreground">
                    {translate.has?.('run.outputLabel')
                      ? translate('run.outputLabel', { ordinal: index + 1 })
                      : `Output ${index + 1}`}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-3">
                    {variant.assetIds.length ? (
                      variant.assetIds.map((id, assetIndex) => {
                        const asset =
                          assets[
                            `${run.draft.output.kind === 'image' ? 'image' : 'video'}:${id}`
                          ];
                        const thumbnail =
                          asset?.thumbnailUrl ||
                          (run.draft.output.kind === 'image'
                            ? asset?.cdnUrl
                            : undefined);
                        return (
                          <div
                            key={id}
                            className="flex min-w-0 items-center gap-2"
                          >
                            {thumbnail ? (
                              <NextImage
                                width={64}
                                height={64}
                                unoptimized
                                src={thumbnail}
                                alt=""
                                className="size-16 rounded-md object-cover"
                                loading="lazy"
                              />
                            ) : null}
                            <span className="max-w-60 break-words text-muted-foreground">
                              {asset
                                ? getIngredientDisplayLabel(asset) !== id
                                  ? getIngredientDisplayLabel(asset)
                                  : translate.has?.('run.outputAssetLabel')
                                    ? translate('run.outputAssetLabel', {
                                        ordinal: index + 1,
                                        asset: assetIndex + 1,
                                      })
                                    : `Output ${index + 1} · Asset ${assetIndex + 1}`
                                : translate.has?.('run.outputAssetUnavailable')
                                  ? translate('run.outputAssetUnavailable', {
                                      ordinal: index + 1,
                                      asset: assetIndex + 1,
                                    })
                                  : `Output ${index + 1} · Asset ${assetIndex + 1} unavailable`}
                            </span>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-muted-foreground">
                        {translate('run.waitingForAssetIds')}
                      </p>
                    )}
                  </div>
                  {variant.content ? (
                    <p className="mt-1 whitespace-pre-wrap text-foreground">
                      {variant.content}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="ghost">{formatLabel(variant.status)}</Badge>
                  {variant.status === 'ready' &&
                  (variant.content || variant.assetIds.length > 0) ? (
                    <Button
                      ariaLabel={translate('run.copyGroup')}
                      icon={<Copy className="size-3.5" />}
                      isDisabled={isWorking}
                      label={translate('run.copyGroup')}
                      onClick={() =>
                        copyVariantGroup(
                          variant.id,
                          variant.content,
                          variant.assetIds,
                        )
                      }
                      size={ButtonSize.XS}
                      variant={ButtonVariant.GHOST}
                    />
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {run.review ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <span className="text-muted-foreground">
            {translate(
              run.review.postIds.length === 1
                ? 'run.review.summaryOne'
                : 'run.review.summaryMany',
              {
                batchId: run.review.batchId,
                count: run.review.postIds.length,
              },
            )}
          </span>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              className="font-medium text-primary hover:text-primary/80"
              href={activeHref(
                `${APP_ROUTES.PUBLISHING.REVIEW}?batch=${encodeURIComponent(run.review.batchId)}`,
              )}
            >
              {translate('run.review.open')}
            </Link>
            {hasApprovedOrganicDrafts ? (
              <Link
                className="font-medium text-primary hover:text-primary/80"
                href={activeHref(
                  createPublishingPostsFilterRoute({
                    publicationState: 'not-posted',
                  }),
                )}
              >
                {translate('run.review.openPublishingDrafts')}
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}

      {canPrepareMetaDraft ? (
        <Button
          icon={<Megaphone className="size-4" />}
          isDisabled={isWorking}
          label={translate('run.preparePaidDraft')}
          onClick={onPreparePaidDraft}
          size={ButtonSize.SM}
          variant={ButtonVariant.DEFAULT}
        />
      ) : null}

      {isMetaHandoffUnavailable ? (
        <Alert type={AlertCategory.INFO}>
          {translate('run.metaHandoffUnavailable')}
        </Alert>
      ) : null}

      {run.paidDraft ? (
        <Alert type={AlertCategory.SUCCESS}>
          {translate('run.paidDraftSummary', {
            adId: run.paidDraft.adId,
            adSetId: run.paidDraft.adSetId,
            campaignId: run.paidDraft.campaignId,
          })}
        </Alert>
      ) : null}

      {!run.execution ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Sparkles className="size-4" />
          {translate('run.prefillHelp')}
        </div>
      ) : null}
    </section>
  );
}
