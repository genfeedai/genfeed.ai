'use client';

import {
  ButtonSize,
  ButtonVariant,
  formatPlatformLabel,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type {
  AccountHealthSummary,
  IChannelTarget,
  IReleaseGroup,
} from '@genfeedai/contracts/interfaces';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import {
  fromDateTimeLocalInput,
  toDateTimeLocalInput,
} from '@helpers/formatting/timezone/timezone.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import ReleaseAnalyticsTable from '@pages/posts/release/release-analytics-table';
import ReleaseEngagementRules from '@pages/posts/release/release-engagement-rules';
import { isCredentialAtRisk } from '@pages/posts/release/release-target-actions.helpers';
import {
  badgeVariantForTone,
  isReleaseReschedulable,
  isTargetBlockedByReadiness,
  isTargetReschedulable,
  releaseStatusBadge,
  releaseTargets,
  targetHistory,
  targetStateBadge,
  validationBadge,
} from '@pages/posts/shared/release-status.helpers';
import type { ReleaseDetailDrawerProps } from '@props/publisher/release-calendar.props';
import { logger } from '@services/core/logger.service';
import { CredentialsService } from '@services/organization/credentials.service';
import TargetPreview from '@ui/previews/TargetPreview';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@ui/primitives/sheet';
import { ExternalLink, Eye, EyeOff, Repeat2 } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

/** Action identifier for the release-level reschedule control. */
export const RELEASE_RESCHEDULE_ACTION = 'release:reschedule';

export function targetRescheduleAction(targetId: string): string {
  return `target:reschedule:${targetId}`;
}

export function targetRetryAction(targetId: string): string {
  return `target:retry:${targetId}`;
}

function targetLabel(target: IChannelTarget): string {
  return formatPlatformLabel(target.platform) ?? target.platform;
}

function formatInstant(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

/**
 * Per-target inputs are keyed by target id and seeded from the target's own
 * scheduled instant, falling back to the release's. A target without its own
 * override still publishes at the release time, so showing an empty field would
 * misrepresent when it goes out.
 */
function seedTargetDates(
  release: IReleaseGroup | null,
): Record<string, string> {
  if (!release) {
    return {};
  }

  const seeded: Record<string, string> = {};
  for (const target of releaseTargets(release)) {
    seeded[target.id] = toDateTimeLocalInput(
      target.scheduledAt ?? release.scheduledAt,
      target.timezone || release.timezone,
    );
  }

  return seeded;
}

function TargetHistory({
  target,
}: {
  target: IChannelTarget;
}): React.JSX.Element {
  const translate = useTranslations('pages.publishing.release');
  const entries = targetHistory(target);

  if (entries.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {translate('noExecutionHistory')}
      </p>
    );
  }

  return (
    <ol className="space-y-1 text-xs text-muted-foreground">
      {entries.map((entry) => (
        <li key={`${entry.label}-${entry.at}`} className="flex flex-col">
          <span className="text-foreground">
            {entry.label} ·{' '}
            <time dateTime={entry.at}>{formatInstant(entry.at)}</time>
          </span>
          {entry.detail ? <span>{entry.detail}</span> : null}
        </li>
      ))}
    </ol>
  );
}

export default function ReleaseDetailDrawer({
  brandId,
  error,
  onAddChannel,
  onClose,
  onRescheduleRelease,
  onRescheduleTarget,
  onRetryTarget,
  pendingAction,
  reconnectHref,
  release,
}: ReleaseDetailDrawerProps): React.JSX.Element {
  const translate = useTranslations('pages.publishing.release');
  const { getToken } = useAuthIdentity();
  const [releaseDate, setReleaseDate] = useState('');
  const [targetDates, setTargetDates] = useState<Record<string, string>>({});
  const [previewTargetId, setPreviewTargetId] = useState<string | null>(null);
  const [accountHealth, setAccountHealth] = useState<AccountHealthSummary[]>(
    [],
  );

  // Re-seed whenever the drawer is pointed at a different release, or the same
  // release comes back from the server with new instants after a mutation.
  useEffect(() => {
    setReleaseDate(
      release
        ? toDateTimeLocalInput(release.scheduledAt, release.timezone)
        : '',
    );
    setTargetDates(seedTargetDates(release));
    setPreviewTargetId(null);
  }, [release]);

  // The drawer owns its own account-health lookup so every caller (calendar,
  // rail) can hand it a brandId without also wiring a credentials fetch.
  useEffect(() => {
    const controller = new AbortController();

    async function loadAccountHealth() {
      if (!brandId) {
        setAccountHealth([]);
        return;
      }
      try {
        const token = (await resolveAuthToken(getToken)) ?? '';
        if (controller.signal.aborted) {
          return;
        }
        const service = CredentialsService.getInstance(token);
        const summaries = await service.listBrandAccountHealth(brandId);
        if (!controller.signal.aborted) {
          setAccountHealth(summaries);
        }
      } catch (fetchError) {
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          return;
        }
        if (!controller.signal.aborted) {
          logger.error(
            'Failed to load release drawer account health',
            fetchError,
          );
        }
      }
    }

    void loadAccountHealth();

    return () => controller.abort();
  }, [brandId, getToken]);

  const isPending = pendingAction !== null;
  const targets = releaseTargets(release);
  const statusBadge = release ? releaseStatusBadge(release) : null;
  const canRescheduleRelease = release
    ? isReleaseReschedulable(release)
    : false;

  return (
    <Sheet
      open={Boolean(release)}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <SheetContent
        side="right"
        className="flex h-full w-full flex-col gap-0 overflow-hidden border-l border-border bg-background p-0 shadow-ambient-lg sm:max-w-[min(56rem,94vw)]"
      >
        <div className="border-b border-border bg-background/95 px-6 pb-5 pt-6 backdrop-blur">
          <SheetHeader className="space-y-3 text-left">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{translate('badgePost')}</Badge>
              {statusBadge ? (
                <Badge variant={badgeVariantForTone(statusBadge.tone)}>
                  {statusBadge.label}
                </Badge>
              ) : null}
            </div>
            <SheetTitle>{release?.title ?? 'Post detail'}</SheetTitle>
            <SheetDescription>
              {release
                ? `${targets.length} channel target${targets.length === 1 ? '' : 's'} · ${release.timezone}`
                : 'Select a post to inspect its targets.'}
            </SheetDescription>
          </SheetHeader>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6">
          {error ? (
            <p
              role="alert"
              className="border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}

          {release ? (
            <section className="space-y-3">
              <h3 className="font-medium text-foreground">
                {translate('schedule')}
              </h3>
              <div className="flex flex-wrap items-end gap-3">
                <Input
                  className="max-w-xs"
                  isDisabled={!canRescheduleRelease || isPending}
                  label="Publish time"
                  onChange={(event) => setReleaseDate(event.target.value)}
                  type="datetime-local"
                  value={releaseDate}
                />
                <Button
                  ariaLabel="Reschedule post"
                  isDisabled={
                    !canRescheduleRelease || isPending || !releaseDate
                  }
                  isLoading={pendingAction === RELEASE_RESCHEDULE_ACTION}
                  label="Reschedule post"
                  onClick={() => {
                    const isoString = fromDateTimeLocalInput(
                      releaseDate,
                      release.timezone,
                    );
                    if (isoString) {
                      onRescheduleRelease(isoString);
                    }
                  }}
                />
              </div>
              {!canRescheduleRelease ? (
                <p className="text-xs text-muted-foreground">
                  {translate('rescheduleLocked')}
                </p>
              ) : null}
            </section>
          ) : null}

          <section className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-medium text-foreground">
                {translate('targets')}
              </h3>
              {onAddChannel && targets.length > 0 ? (
                <Button
                  size={ButtonSize.SM}
                  variant={ButtonVariant.SECONDARY}
                  onClick={onAddChannel}
                  isDisabled={pendingAction !== null}
                  icon={<Repeat2 className="size-4" />}
                  label="Add channel"
                  tooltip="Adapt this post's content into a draft for another channel"
                />
              ) : null}
            </div>
            {targets.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {translate('noTargets')}
              </p>
            ) : (
              targets.map((target) => {
                const stateBadge = targetStateBadge(target.executionState);
                const validation = validationBadge(target.validationState);
                const isBlocked = isTargetBlockedByReadiness(target);
                const canReschedule =
                  isTargetReschedulable(target) && !isBlocked;
                const canRetry =
                  target.executionState === TargetExecutionState.FAILED &&
                  !isBlocked;
                const rescheduleAction = targetRescheduleAction(target.id);
                const retryAction = targetRetryAction(target.id);
                const inputLabel = `${targetLabel(target)} time`;
                const isPreviewOpen = previewTargetId === target.id;
                const needsReconnect = isCredentialAtRisk(
                  accountHealth,
                  target.credentialId,
                );
                const hasPreview = Boolean(target.url);

                return (
                  <article
                    key={target.id}
                    className="space-y-3 border border-border bg-card p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-foreground">
                        {targetLabel(target)}
                      </span>
                      <Badge variant={badgeVariantForTone(stateBadge.tone)}>
                        {stateBadge.label}
                      </Badge>
                      <Badge variant={badgeVariantForTone(validation.tone)}>
                        {validation.label}
                      </Badge>
                      <Badge variant="secondary">{target.source}</Badge>
                      <Button
                        ariaLabel={`${isPreviewOpen ? 'Hide' : 'Preview'} ${targetLabel(target)} target`}
                        className="ml-auto"
                        icon={
                          isPreviewOpen ? (
                            <EyeOff className="size-3.5" />
                          ) : (
                            <Eye className="size-3.5" />
                          )
                        }
                        label={isPreviewOpen ? 'Hide preview' : 'Preview'}
                        onClick={() =>
                          setPreviewTargetId(isPreviewOpen ? null : target.id)
                        }
                        size={ButtonSize.SM}
                        variant={ButtonVariant.SECONDARY}
                      />
                    </div>

                    {isPreviewOpen && release ? (
                      <TargetPreview
                        className="max-w-sm"
                        credential={
                          target.credential ?? { platform: target.platform }
                        }
                        release={release}
                        target={target}
                      />
                    ) : null}

                    {target.validationIssues.length > 0 ? (
                      <ol className="space-y-1 text-xs text-muted-foreground">
                        {target.validationIssues.map((issue) => (
                          <li key={issue}>{issue}</li>
                        ))}
                      </ol>
                    ) : null}

                    {isBlocked ? (
                      <div className="border border-warning/40 bg-warning/10 p-3 text-xs">
                        <p className="font-medium text-foreground">
                          {translate('readinessBlocked')}
                        </p>
                        {target.readiness?.requiredAction ? (
                          <p className="mt-1 text-muted-foreground">
                            {target.readiness.requiredAction}
                          </p>
                        ) : null}
                        <ol className="mt-1 space-y-1 text-muted-foreground">
                          {(target.readiness?.diagnostics ?? []).map(
                            (diagnostic) => (
                              <li key={diagnostic.code}>
                                {diagnostic.message}
                              </li>
                            ),
                          )}
                        </ol>
                        <Button
                          asChild
                          className="mt-3"
                          size={ButtonSize.SM}
                          variant={ButtonVariant.SECONDARY}
                        >
                          <Link href={reconnectHref}>
                            {translate('actions.reconnect', {
                              target: targetLabel(target),
                            })}
                          </Link>
                        </Button>
                      </div>
                    ) : null}

                    {target.error ? (
                      <p className="text-xs text-destructive">
                        {target.error.message}
                      </p>
                    ) : null}

                    <TargetHistory target={target} />

                    {release ? (
                      <ReleaseEngagementRules
                        postGroupId={release.id}
                        reconnectHref={reconnectHref}
                        target={target}
                      />
                    ) : null}

                    {hasPreview || needsReconnect ? (
                      <div className="flex flex-wrap items-center gap-2">
                        {hasPreview ? (
                          <Button
                            asChild
                            size={ButtonSize.SM}
                            variant={ButtonVariant.SECONDARY}
                            icon={<ExternalLink className="size-3.5" />}
                          >
                            <Link
                              href={target.url ?? ''}
                              rel="noopener noreferrer"
                              target="_blank"
                            >
                              {translate('actions.preview')}
                            </Link>
                          </Button>
                        ) : null}
                        {needsReconnect ? (
                          <Button
                            asChild
                            size={ButtonSize.SM}
                            variant={ButtonVariant.SECONDARY}
                          >
                            <Link href={reconnectHref}>
                              {translate('actions.reconnect', {
                                target: targetLabel(target),
                              })}
                            </Link>
                          </Button>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="flex flex-wrap items-end gap-3">
                      <Input
                        className="max-w-xs"
                        isDisabled={!canReschedule || isPending}
                        label={inputLabel}
                        onChange={(event) =>
                          setTargetDates((current) => ({
                            ...current,
                            [target.id]: event.target.value,
                          }))
                        }
                        type="datetime-local"
                        value={targetDates[target.id] ?? ''}
                      />
                      <Button
                        // A release fans out to several identically-labelled
                        // controls; the platform keeps each one distinguishable
                        // to a screen reader, and keeps the accessible name
                        // stable while the spinner replaces the visible text.
                        ariaLabel={`Reschedule ${targetLabel(target)} target`}
                        isDisabled={
                          !canReschedule || isPending || !targetDates[target.id]
                        }
                        isLoading={pendingAction === rescheduleAction}
                        label="Reschedule target"
                        onClick={() => {
                          const isoString = fromDateTimeLocalInput(
                            targetDates[target.id] ?? '',
                            target.timezone || (release?.timezone ?? 'UTC'),
                          );
                          if (isoString) {
                            onRescheduleTarget(target.id, isoString);
                          }
                        }}
                      />
                      {target.executionState === TargetExecutionState.FAILED ? (
                        <Button
                          ariaLabel={`Retry ${targetLabel(target)} target`}
                          isDisabled={!canRetry || isPending}
                          isLoading={pendingAction === retryAction}
                          label="Retry target"
                          onClick={() => onRetryTarget(target.id)}
                        />
                      ) : null}
                    </div>
                  </article>
                );
              })
            )}
          </section>

          <section className="space-y-3">
            <h3 className="font-medium text-foreground">
              {translate('analytics.title')}
            </h3>
            <ReleaseAnalyticsTable comparison={release?.analyticsComparison} />
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
