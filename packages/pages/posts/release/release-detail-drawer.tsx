'use client';

import { ContextSidebarPanel } from '@contexts/ui/context-sidebar-context';
import {
  ButtonSize,
  ButtonVariant,
  formatPlatformLabel,
  ReleaseStatus,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type {
  AccountHealthSummary,
  IChannelTarget,
} from '@genfeedai/contracts/interfaces';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { getPublishingPostHref } from '@helpers/content/posts.helper';
import { stripHtmlToPlainText } from '@helpers/security/sanitize-html.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import ReleaseAnalyticsTable from '@pages/posts/release/release-analytics-table';
import ReleaseEngagementRules from '@pages/posts/release/release-engagement-rules';
import ReleaseRescheduleField from '@pages/posts/release/release-reschedule-field';
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
import Tabs from '@ui/navigation/tabs/Tabs';
import TargetPreview from '@ui/previews/TargetPreview';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { ExternalLink, Repeat2 } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

/** Action identifier for the release-level reschedule control. */
export const RELEASE_RESCHEDULE_ACTION = 'release:reschedule';
export const RELEASE_RESUME_ACTION = 'release:resume';

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
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-US');
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
  onResumeRelease,
  onRetryTarget,
  pendingAction,
  reconnectHref,
  release,
}: ReleaseDetailDrawerProps): React.JSX.Element {
  const translate = useTranslations('pages.publishing.release');
  const { href } = useOrgUrl();
  const { getToken } = useAuthIdentity();
  const [accountHealth, setAccountHealth] = useState<AccountHealthSummary[]>(
    [],
  );
  const [activeDrawerTab, setActiveDrawerTab] = useState<
    'preview' | 'analytics'
  >('preview');

  // Only reset the active tab when the drawer points at a *different*
  // release — a mutation-triggered refetch of the same release should not
  // yank the reader off the analytics tab back to preview.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on id, not the whole release object.
  useEffect(() => {
    setActiveDrawerTab('preview');
  }, [release?.id]);

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
  const isPaused = release?.status === ReleaseStatus.PAUSED;
  const holdReason = targets
    .map((target) =>
      accountHealth.find((row) => row.credentialId === target.credentialId),
    )
    .find((row) => row?.holdPublishing)?.holdReason;
  const previewTitle =
    stripHtmlToPlainText(release?.title) || translate('untitledPost');
  const editorHref = release
    ? href(getPublishingPostHref(targets[0]?.id ?? release.id))
    : null;

  if (!release) {
    return (
      <ContextSidebarPanel onClose={onClose} selection={null}>
        {null}
      </ContextSidebarPanel>
    );
  }

  return (
    <ContextSidebarPanel
      onClose={onClose}
      selection={{
        id: release.id,
        kind: 'post',
        origin: 'user',
        subtitle: translate('targetsSummary', {
          count: targets.length,
          timezone: release.timezone,
        }),
        title: previewTitle,
      }}
    >
      <div className="flex flex-col" data-testid="release-detail-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{translate('badgePost')}</Badge>
            {statusBadge ? (
              <Badge variant={badgeVariantForTone(statusBadge.tone)}>
                {statusBadge.label}
              </Badge>
            ) : null}
          </div>
          {editorHref ? (
            <Button
              asChild
              size={ButtonSize.SM}
              variant={ButtonVariant.SECONDARY}
              icon={<ExternalLink className="size-3.5" />}
            >
              <Link href={editorHref}>{translate('openEditor')}</Link>
            </Button>
          ) : null}
        </div>

        <div className="border-b border-border px-4 py-3">
          <Tabs
            activeTab={activeDrawerTab}
            ariaLabel={translate('tabs.preview')}
            fullWidth={false}
            items={[
              { id: 'preview', label: translate('tabs.preview') },
              { id: 'analytics', label: translate('tabs.analytics') },
            ]}
            onTabChange={(tab) =>
              setActiveDrawerTab(tab === 'analytics' ? 'analytics' : 'preview')
            }
          />
        </div>

        {activeDrawerTab === 'preview' ? (
          <div className="space-y-6 p-4">
            {error ? (
              <p
                role="alert"
                className="border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
              >
                {error}
              </p>
            ) : null}

            {isPaused ? (
              <div
                role="status"
                className="space-y-3 border border-warning/40 bg-warning/10 p-3 text-sm"
              >
                <p className="font-medium text-foreground">
                  {translate('pausedHold')}
                </p>
                {holdReason ? (
                  <p className="text-muted-foreground">
                    {translate('warmupHold', { reason: holdReason })}
                  </p>
                ) : null}
                {onResumeRelease ? (
                  <Button
                    isDisabled={isPending}
                    isLoading={pendingAction === RELEASE_RESUME_ACTION}
                    label={translate('resume')}
                    onClick={onResumeRelease}
                    size={ButtonSize.SM}
                  />
                ) : null}
              </div>
            ) : null}

            <section className="space-y-3">
              <h3 className="font-medium text-foreground">
                {translate('schedule')}
              </h3>
              <ReleaseRescheduleField
                buttonAriaLabel={translate('reschedule.releaseAction')}
                buttonLabel={translate('reschedule.releaseAction')}
                fieldLabel={translate('reschedule.releaseTime')}
                isDisabled={!canRescheduleRelease}
                isPending={isPending}
                isSaving={pendingAction === RELEASE_RESCHEDULE_ACTION}
                key={release.id}
                onReschedule={onRescheduleRelease}
                scheduledAt={release.scheduledAt}
                timezone={release.timezone}
              />
              {!canRescheduleRelease ? (
                <p className="text-xs text-muted-foreground">
                  {translate('rescheduleLocked')}
                </p>
              ) : null}
            </section>

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
                    isDisabled={isPending}
                    icon={<Repeat2 className="size-4" />}
                    label={translate('addChannel')}
                    tooltip={translate('addChannelTooltip')}
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
                  const retryAction = targetRetryAction(target.id);
                  const platform = targetLabel(target);
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
                          {platform}
                        </span>
                        <Badge variant={badgeVariantForTone(stateBadge.tone)}>
                          {stateBadge.label}
                        </Badge>
                        <Badge variant={badgeVariantForTone(validation.tone)}>
                          {validation.label}
                        </Badge>
                        <Badge variant="secondary">{target.source}</Badge>
                      </div>

                      <TargetPreview
                        className="max-w-sm"
                        credential={
                          target.credential ?? { platform: target.platform }
                        }
                        release={release}
                        target={target}
                      />

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
                                target: platform,
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

                      <ReleaseEngagementRules
                        postGroupId={release.id}
                        reconnectHref={reconnectHref}
                        target={target}
                      />

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
                                  target: platform,
                                })}
                              </Link>
                            </Button>
                          ) : null}
                        </div>
                      ) : null}

                      <ReleaseRescheduleField
                        buttonAriaLabel={translate(
                          'reschedule.targetActionAriaLabel',
                          { platform },
                        )}
                        buttonLabel={translate('reschedule.targetAction')}
                        fieldLabel={translate('reschedule.targetTime', {
                          platform,
                        })}
                        isDisabled={!canReschedule}
                        isPending={isPending}
                        isSaving={
                          pendingAction === targetRescheduleAction(target.id)
                        }
                        onReschedule={(scheduledDate) =>
                          onRescheduleTarget(target.id, scheduledDate)
                        }
                        scheduledAt={target.scheduledAt ?? release.scheduledAt}
                        timezone={target.timezone || release.timezone}
                      />
                      {target.executionState === TargetExecutionState.FAILED ? (
                        <Button
                          ariaLabel={translate('retryAriaLabel', { platform })}
                          className="w-full"
                          isDisabled={!canRetry || isPending}
                          isLoading={pendingAction === retryAction}
                          label={translate('retryTarget')}
                          onClick={() => onRetryTarget(target.id)}
                          withWrapper={false}
                        />
                      ) : null}
                    </article>
                  );
                })
              )}
            </section>
          </div>
        ) : (
          <div className="p-4">
            <section className="space-y-3">
              <h3 className="font-medium text-foreground">
                {translate('analytics.title')}
              </h3>
              <ReleaseAnalyticsTable comparison={release.analyticsComparison} />
            </section>
          </div>
        )}
      </div>
    </ContextSidebarPanel>
  );
}
