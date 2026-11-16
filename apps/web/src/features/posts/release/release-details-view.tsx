'use client';

import {
  ButtonSize,
  ButtonVariant,
  formatPlatformLabel,
  ReleaseStatus,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { parseXQuotedPostId } from '@genfeedai/contracts/api-types/contracts/x-quote-post.contract';
import { getPlatformIcon } from '@helpers/ui/platform-icon/platform-icon.helper';
import {
  Alert,
  AlertActions,
  AlertDescription,
  AlertTitle,
} from '@ui/primitives/alert';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import {
  DefinitionDetail,
  DefinitionList,
  DefinitionRow,
  DefinitionTerm,
} from '@ui/primitives/definition-list';
import { Repeat2 } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { resolveTargetCaption } from '@/components/previews/preview.helpers';
import type { ReleaseDetailsViewProps } from '@/features/posts/props/release-drawer.props';
import ReleaseEngagementRules from '@/features/posts/release/release-engagement-rules';
import ReleaseManualPostCard from '@/features/posts/release/release-manual-post-card';
import ReleaseRescheduleField from '@/features/posts/release/release-reschedule-field';
import {
  isCredentialAtRisk,
  isManualPostTarget,
} from '@/features/posts/release/release-target-actions.helpers';
import {
  badgeVariantForTone,
  isReleaseReschedulable,
  isTargetBlockedByReadiness,
  isTargetReschedulable,
  releaseStatusBadge,
  releaseTargets,
  releaseTimeline,
  targetStateBadge,
  validationBadge,
} from '@/features/posts/shared/release-status.helpers';
import { formatInstant } from './format-instant';
import {
  RELEASE_RESCHEDULE_ACTION,
  targetRescheduleAction,
  targetRetryAction,
} from './release-actions';

const LIVE_STATUSES = new Set<ReleaseStatus>([
  ReleaseStatus.PARTIALLY_PUBLISHED,
  ReleaseStatus.PUBLISHED,
]);

/**
 * Everything about a post that is not the post itself: its status and timing,
 * the schedule, and one block per channel with its problems and actions. A
 * post that is already live never shows a schedule control or a schedule label.
 */
export default function ReleaseDetailsView({
  accountHealth,
  onAddChannel,
  onCompleteManualPost,
  onRescheduleRelease,
  onRescheduleTarget,
  onRetryTarget,
  onSkipManualPost,
  pendingAction,
  reconnectHref,
  release,
}: ReleaseDetailsViewProps): React.JSX.Element {
  const translate = useTranslations('pages.publishing.release');
  const targets = releaseTargets(release);
  const isPending = pendingAction !== null;
  const statusBadge = releaseStatusBadge(release);
  const timeline = releaseTimeline(release);
  const isLive = LIVE_STATUSES.has(release.status);
  const canRescheduleRelease = isReleaseReschedulable(release);

  return (
    <div className="space-y-6 p-4" data-testid="release-details-view">
      <DefinitionList variant="properties">
        <DefinitionRow>
          <DefinitionTerm variant="muted">
            {translate('details.status')}
          </DefinitionTerm>
          <DefinitionDetail>
            <Badge variant={badgeVariantForTone(statusBadge.tone)}>
              {statusBadge.label}
            </Badge>
          </DefinitionDetail>
        </DefinitionRow>
        {timeline ? (
          <DefinitionRow>
            <DefinitionTerm variant="muted">
              {translate(`details.${timeline.kind}`)}
            </DefinitionTerm>
            <DefinitionDetail>
              <time dateTime={timeline.at}>{formatInstant(timeline.at)}</time>
            </DefinitionDetail>
          </DefinitionRow>
        ) : null}
      </DefinitionList>

      {!isLive ? (
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
            const isPublished =
              target.executionState === TargetExecutionState.PUBLISHED;
            const isBlocked =
              !isPublished && isTargetBlockedByReadiness(target);
            const canReschedule = isTargetReschedulable(target) && !isBlocked;
            const canRetry =
              target.executionState === TargetExecutionState.FAILED &&
              !isBlocked;
            const retryAction = targetRetryAction(target.id);
            const platform =
              formatPlatformLabel(target.platform) ?? target.platform;
            const needsReconnect = isCredentialAtRisk(
              accountHealth,
              target.credentialId,
            );
            const hasPermalink = Boolean(target.url);

            return (
              <article
                key={target.id}
                className="space-y-3 border-b border-border pb-4 last:border-b-0 last:pb-0"
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

                {target.validationIssues.length > 0 ? (
                  <ol className="space-y-1 text-xs text-muted-foreground">
                    {target.validationIssues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ol>
                ) : null}

                {isBlocked ? (
                  <Alert size="sm" variant="warning">
                    <AlertTitle>{translate('readinessBlocked')}</AlertTitle>
                    {target.readiness?.requiredAction ? (
                      <AlertDescription>
                        {target.readiness.requiredAction}
                      </AlertDescription>
                    ) : null}
                    <ol className="mt-1 space-y-1">
                      {(target.readiness?.diagnostics ?? []).map(
                        (diagnostic) => (
                          <li key={diagnostic.code}>{diagnostic.message}</li>
                        ),
                      )}
                    </ol>
                    <AlertActions>
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
                    </AlertActions>
                  </Alert>
                ) : null}

                {onCompleteManualPost &&
                onSkipManualPost &&
                isManualPostTarget(target) ? (
                  <ReleaseManualPostCard
                    caption={resolveTargetCaption(release, target)}
                    isPending={isPending}
                    onComplete={(postUrl) =>
                      onCompleteManualPost(target.id, postUrl)
                    }
                    onSkip={() => onSkipManualPost(target.id)}
                    quotedPostId={
                      parseXQuotedPostId(target.settings?.quotedPost) ?? null
                    }
                  />
                ) : target.error ? (
                  <p className="text-xs text-destructive">
                    {target.error.message}
                  </p>
                ) : null}

                <ReleaseEngagementRules
                  postGroupId={release.id}
                  reconnectHref={reconnectHref}
                  target={target}
                />

                {hasPermalink || needsReconnect ? (
                  <div className="flex flex-wrap items-center gap-2">
                    {hasPermalink ? (
                      <Button
                        asChild
                        ariaLabel={translate('actions.viewOnPlatform', {
                          platform,
                        })}
                        size={ButtonSize.SM}
                        variant={ButtonVariant.SECONDARY}
                      >
                        <Link
                          href={target.url ?? ''}
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          {getPlatformIcon(target.platform, 'size-4')}
                          {translate('actions.view')}
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

                {!isPublished ? (
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
                ) : null}
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
  );
}
