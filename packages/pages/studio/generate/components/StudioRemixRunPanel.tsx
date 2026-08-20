'use client';

import type { BrandRemixRunView } from '@api-types/contracts';
import { APP_ROUTES } from '@genfeedai/constants';
import { AlertCategory, ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import Badge from '@ui/display/badge/Badge';
import Alert from '@ui/feedback/alert/Alert';
import { Button } from '@ui/primitives/button';
import { GitBranch, Send, Sparkles } from 'lucide-react';
import Link from 'next/link';
import type { ReactElement } from 'react';

export interface StudioRemixRunPanelProps {
  readonly error: string | null;
  readonly isWorking: boolean;
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
  onReview,
  onVary,
  run,
}: StudioRemixRunPanelProps): ReactElement {
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
  const hasCanonicalIdentity = 'avatarAssetId' in run.draft.identity;
  const isMetaHandoffUnavailable =
    isPaidMeta &&
    run.phase === 'approved' &&
    Boolean(run.review?.approvedPostIds.length) &&
    !run.paidDraft;
  const hasApprovedOrganicDrafts =
    run.draft.target.kind === 'organic' &&
    run.phase === 'approved' &&
    Boolean(run.review?.approvedPostIds.length);

  return (
    <section
      aria-label="Remix run"
      className="space-y-4 border-y border-border bg-card/40 p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{formatLabel(run.phase)}</Badge>
            <Badge variant="ghost">{run.brand.name}</Badge>
            <span className="text-xs text-muted-foreground">
              Recipe v{run.recipeVersion} · revision {run.revision}
            </span>
          </div>
          <h2 className="mt-2 text-sm font-semibold text-foreground">
            {run.sourceSnapshot.title}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatLabel(run.draft.target.kind)} ·{' '}
            {formatLabel(run.draft.target.platform)} ·{' '}
            {formatLabel(run.draft.output.kind)} ·{' '}
            {run.draft.output.aspectRatio}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {run.execution ? (
            <Button
              icon={<GitBranch className="size-4" />}
              isDisabled={isWorking}
              label="Vary recipe"
              onClick={onVary}
              size={ButtonSize.SM}
              variant={ButtonVariant.SECONDARY}
            />
          ) : null}
          {readyVariantIds.length && !run.review ? (
            <Button
              icon={<Send className="size-4" />}
              isDisabled={isWorking}
              label={`Send ${readyVariantIds.length} to Review`}
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
              {formatLabel(run.readiness.state)} run
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

      {hasCanonicalIdentity ? (
        <div
          aria-label="Canonical identity"
          className="flex flex-wrap gap-2"
          role="group"
        >
          <Badge variant="secondary">
            Avatar · {run.draft.identity.avatarAssetId}
          </Badge>
          <Badge variant="secondary">
            Voice · {run.draft.identity.speechVoiceId}
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
                    : 'Waiting for durable asset ids'}
                </p>
              </div>
              <Badge variant="ghost">{formatLabel(variant.status)}</Badge>
            </div>
          ))}
        </div>
      ) : null}

      {run.review ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <span className="text-muted-foreground">
            Review batch {run.review.batchId} · {run.review.postIds.length}{' '}
            drafts
          </span>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              className="font-medium text-primary hover:text-primary/80"
              href={activeHref(
                `${APP_ROUTES.PUBLISH.REVIEW}?batch=${encodeURIComponent(run.review.batchId)}`,
              )}
            >
              Open Review
            </Link>
            {hasApprovedOrganicDrafts ? (
              <Link
                className="font-medium text-primary hover:text-primary/80"
                href={activeHref(APP_ROUTES.PUBLISH.SCHEDULED)}
              >
                Open Publish drafts
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}

      {isMetaHandoffUnavailable ? (
        <Alert type={AlertCategory.INFO}>
          Meta handoff is waiting for approved creative upload support.
        </Alert>
      ) : null}

      {run.paidDraft ? (
        <Alert type={AlertCategory.SUCCESS}>
          Campaign {run.paidDraft.campaignId}, ad set {run.paidDraft.adSetId},
          and ad {run.paidDraft.adId} are PAUSED for review.
        </Alert>
      ) : null}

      {!run.execution ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Sparkles className="size-4" />
          Review the prefilled recipe below, then generate its variations.
        </div>
      ) : null}
    </section>
  );
}
