'use client';

import type { BrandRemixRunView } from '@api-types/contracts';
import { APP_ROUTES } from '@genfeedai/constants';
import { AlertCategory, ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { ClipboardService } from '@genfeedai/services/core/clipboard.service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { resolvePairedRemixIdentity } from '@pages/studio/generate/utils/studio-remix-run';
import Badge from '@ui/display/badge/Badge';
import Alert from '@ui/feedback/alert/Alert';
import { Button } from '@ui/primitives/button';
import { Copy, GitBranch, Megaphone, Send, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';

export interface StudioRemixRunPanelProps {
  readonly error: string | null;
  readonly isWorking: boolean;
  readonly onPreparePaidDraft?: () => void;
  readonly onReview: (variantIds: string[]) => void;
  readonly onVary: () => void;
  readonly run: BrandRemixRunView;
}

function formatLabel(value: string): string {
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function StudioRemixRunPanel({
  error,
  isWorking,
  onPreparePaidDraft,
  onReview,
  onVary,
  run,
}: StudioRemixRunPanelProps): ReactElement {
  const translate = useTranslations('pages.studioGenerate');
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
  const canonicalIdentity = resolvePairedRemixIdentity(run.draft.identity);
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
      aria-label={translate('remixRun.regionLabel')}
      className="space-y-4 border-y border-border bg-card/40 p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{formatLabel(run.phase)}</Badge>
            <Badge variant="ghost">{run.brand.name}</Badge>
            <span className="text-xs text-muted-foreground">
              {translate('remixRun.recipeRevision', {
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
              label={translate('remixRun.varyRecipe')}
              onClick={onVary}
              size={ButtonSize.SM}
              variant={ButtonVariant.SECONDARY}
            />
          ) : null}
          {readyVariantIds.length > 0 && !run.review ? (
            <Button
              icon={<Send className="size-4" />}
              isDisabled={isWorking}
              label={translate('remixRun.sendToReview', {
                count: readyVariantIds.length,
              })}
              onClick={() => onReview(readyVariantIds)}
              size={ButtonSize.SM}
              variant={ButtonVariant.DEFAULT}
            />
          ) : null}
        </div>
      </div>

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
              {translate('remixRun.readinessTitle', {
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
          aria-label="Canonical identity"
          className="flex flex-wrap gap-2"
          role="group"
        >
          <Badge variant="secondary">
            {translate('remixRun.identity.avatar', {
              id: canonicalIdentity.avatarAssetId,
            })}
          </Badge>
          <Badge variant="secondary">
            {translate('remixRun.identity.voice', {
              id: canonicalIdentity.speechVoiceId,
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
            {translate('remixRun.outputCount', {
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
            {run.execution.variants.map((variant) => (
              <div
                className="flex items-center justify-between gap-3 py-2 text-xs"
                key={variant.id}
              >
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{variant.id}</p>
                  <p className="truncate text-muted-foreground">
                    {variant.assetIds.length
                      ? variant.assetIds.join(', ')
                      : translate('remixRun.waitingForAssetIds')}
                  </p>
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
                      ariaLabel={translate('remixRun.copyGroup')}
                      icon={<Copy className="size-3.5" />}
                      isDisabled={isWorking}
                      label={translate('remixRun.copyGroup')}
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
                ? 'remixRun.review.summaryOne'
                : 'remixRun.review.summaryMany',
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
              {translate('remixRun.review.open')}
            </Link>
            {hasApprovedOrganicDrafts ? (
              <Link
                className="font-medium text-primary hover:text-primary/80"
                href={activeHref(APP_ROUTES.PUBLISHING.SCHEDULED)}
              >
                {translate('remixRun.review.openPublishingDrafts')}
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}

      {canPrepareMetaDraft ? (
        <Button
          icon={<Megaphone className="size-4" />}
          isDisabled={isWorking}
          label={translate('remixRun.preparePaidDraft')}
          onClick={onPreparePaidDraft}
          size={ButtonSize.SM}
          variant={ButtonVariant.DEFAULT}
        />
      ) : null}

      {isMetaHandoffUnavailable ? (
        <Alert type={AlertCategory.INFO}>
          {translate('remixRun.metaHandoffUnavailable')}
        </Alert>
      ) : null}

      {run.paidDraft ? (
        <Alert type={AlertCategory.SUCCESS}>
          {translate('remixRun.paidDraftSummary', {
            adId: run.paidDraft.adId,
            adSetId: run.paidDraft.adSetId,
            campaignId: run.paidDraft.campaignId,
          })}
        </Alert>
      ) : null}

      {!run.execution ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Sparkles className="size-4" />
          {translate('remixRun.prefillHelp')}
        </div>
      ) : null}
    </section>
  );
}
