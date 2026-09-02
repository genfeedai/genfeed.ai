'use client';

import {
  ButtonSize,
  ButtonVariant,
  formatPlatformLabel,
} from '@genfeedai/contracts';
import {
  getCurrentSocialWarmupBlueprint,
  resolveSocialWarmupBlueprint,
} from '@genfeedai/contracts/api-types/contracts/social-warmup-blueprint.contract';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useSocialWarmupEnrollment } from '@hooks/data/social/use-social-warmup-enrollment/use-social-warmup-enrollment';
import type { SocialWarmupProgramProps } from '@props/social/social-warmup-program.props';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { ServicesService } from '@services/external/services.service';
import { resolveOAuthServicePath } from '@ui/constants/oauth-connect-platforms';
import { Alert, AlertDescription, AlertTitle } from '@ui/primitives/alert';
import { Avatar, AvatarFallback, AvatarImage } from '@ui/primitives/avatar';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { Progress } from '@ui/primitives/progress';
import { Skeleton } from '@ui/primitives/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@ui/primitives/tabs';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import SocialWarmupCheckItem from './SocialWarmupCheckItem';
import {
  buildSocialWarmupProgramModel,
  canRefreshAuthorizedSignals,
  collectSocialWarmupChecks,
  resolveEnrolledBlueprint,
  resolveWarmupCheck,
} from './social-warmup.helpers';

const STATE_MESSAGE_KEYS = {
  healthy: 'state.healthy',
  not_started: 'state.not_started',
  risky: 'state.risky',
  warming: 'state.warming',
} as const;

function getConnectionLabel(
  name?: string | null,
  handle?: string | null,
  platform?: string,
): string {
  return name || handle || platform || 'Account';
}

function getInitials(label: string, platform: string): string {
  const initials = label
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
  return initials || platform.slice(0, 2).toUpperCase();
}

function formatRefreshTime(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export default function SocialWarmupProgram({
  connection,
  health,
  onOverrideRequest,
  onReconnect,
  variant = 'compact',
}: SocialWarmupProgramProps) {
  const translate = useTranslations('pages.socialWarmup');
  const { getToken } = useAuthIdentity();
  const { completeItem, data, enroll, error, isLoading, refresh, reopenItem } =
    useSocialWarmupEnrollment({
      credentialId: connection.credentialId,
    });
  const [view, setView] = useState<'today' | 'full'>('today');
  const [focusedCheckId, setFocusedCheckId] = useState<string | null>(null);
  const [isRefreshingSignals, setIsRefreshingSignals] = useState(false);
  const [signalsError, setSignalsError] = useState<string | null>(null);
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const enrollAttemptedFor = useRef<string | null>(null);

  const platform = connection.platform;
  const currentBlueprint = getCurrentSocialWarmupBlueprint(platform);
  const enrolledBlueprint = data
    ? resolveEnrolledBlueprint(data, resolveSocialWarmupBlueprint)
    : null;
  const blueprint = enrolledBlueprint ?? currentBlueprint;

  useEffect(() => {
    if (
      !connection.credentialId ||
      isLoading ||
      data ||
      !currentBlueprint ||
      enrollAttemptedFor.current === connection.credentialId
    ) {
      return;
    }

    let isCancelled = false;
    enrollAttemptedFor.current = connection.credentialId;
    void enroll(connection.credentialId)
      .then(() => {
        if (!isCancelled) {
          setEnrollError(null);
        }
      })
      .catch((enrollFailure: unknown) => {
        if (isCancelled) {
          return;
        }
        logger.error('Failed to enroll social warm-up', enrollFailure);
        setEnrollError(translate('enrollError'));
      });

    return () => {
      isCancelled = true;
    };
  }, [
    connection.credentialId,
    currentBlueprint,
    data,
    enroll,
    isLoading,
    translate,
  ]);

  const model = useMemo(() => {
    if (!blueprint || !data) {
      return null;
    }

    return buildSocialWarmupProgramModel({
      blueprint,
      enrollment: data,
      isRefreshingSignals,
      platform,
    });
  }, [blueprint, data, isRefreshingSignals, platform]);

  const fullChecks = useMemo(() => {
    if (!blueprint || !data) {
      return [];
    }

    return collectSocialWarmupChecks(blueprint).map((check) =>
      resolveWarmupCheck(check, data, platform, isRefreshingSignals),
    );
  }, [blueprint, data, isRefreshingSignals, platform]);

  useEffect(() => {
    if (!focusedCheckId || view !== 'full') {
      return;
    }

    const node = document.getElementById(`warmup-check-${focusedCheckId}`);
    node?.focus();
  }, [focusedCheckId, view]);

  async function handleComplete(itemId: string) {
    setPendingItemId(itemId);
    try {
      await completeItem(itemId);
    } catch (completeError) {
      logger.error('Failed to complete warm-up check', completeError);
      NotificationsService.getInstance().error(translate('markComplete'));
    } finally {
      setPendingItemId(null);
    }
  }

  async function handleReopen(itemId: string) {
    setPendingItemId(itemId);
    try {
      await reopenItem(itemId);
    } catch (reopenError) {
      logger.error('Failed to reopen warm-up check', reopenError);
      NotificationsService.getInstance().error(translate('reopen'));
    } finally {
      setPendingItemId(null);
    }
  }

  async function handleRefreshSignals() {
    if (!canRefreshAuthorizedSignals(platform)) {
      return;
    }

    setIsRefreshingSignals(true);
    setSignalsError(null);
    try {
      const token = (await resolveAuthToken(getToken)) ?? '';
      const service = new ServicesService(
        resolveOAuthServicePath(platform),
        token,
      );
      await service.refreshAuthorizedSignals(connection.credentialId);
      await refresh();
    } catch (refreshError) {
      logger.error(
        'Failed to refresh authorized warm-up signals',
        refreshError,
      );
      setSignalsError(translate('signalsError'));
    } finally {
      setIsRefreshingSignals(false);
    }
  }

  function handleFocusCheck(itemId: string) {
    setView('full');
    setFocusedCheckId(itemId);
  }

  const label = getConnectionLabel(
    connection.name ?? health?.label,
    connection.handle ?? health?.handle,
    platform,
  );
  const handle = (connection.handle ?? health?.handle ?? '').replace(/^@/, '');
  const platformLabel = formatPlatformLabel(platform) ?? platform;
  const lastRefreshLabel = formatRefreshTime(model?.lastRefreshAt ?? null);

  if (isLoading && !data) {
    return (
      <div className="space-y-3" aria-busy="true" aria-live="polite">
        <p className="text-xs text-muted-foreground">{translate('loading')}</p>
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!currentBlueprint && !data) {
    return null;
  }

  if (enrollError || error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>{translate('programTitle')}</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>{enrollError ?? translate('enrollError')}</p>
          <Button
            onClick={() => {
              enrollAttemptedFor.current = null;
              setEnrollError(null);
              void enroll(connection.credentialId);
            }}
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
          >
            {translate('retryEnroll')}
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (data && !enrolledBlueprint) {
    return (
      <Alert variant="warning">
        <AlertTitle>{translate('programTitle')}</AlertTitle>
        <AlertDescription>{translate('blueprintMissing')}</AlertDescription>
      </Alert>
    );
  }

  if (!model || !data || !blueprint) {
    return (
      <div className="space-y-3" aria-busy="true" aria-live="polite">
        <p className="text-xs text-muted-foreground">
          {translate('enrolling')}
        </p>
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  const readinessKey = health
    ? STATE_MESSAGE_KEYS[health.state]
    : STATE_MESSAGE_KEYS.warming;
  const isCompact = variant === 'compact';

  return (
    <section className="space-y-4" aria-label={translate('programTitle')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar className="size-10 bg-background shadow-border">
            {connection.avatarUrl ? (
              <AvatarImage
                alt={`${label} profile picture`}
                className="object-cover"
                src={connection.avatarUrl}
              />
            ) : null}
            <AvatarFallback className="text-xs font-semibold text-foreground/70">
              {getInitials(label, platform)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-medium">{label}</h3>
            <p className="truncate text-xs text-muted-foreground">
              {handle ? translate('accountHandle', { handle }) : platformLabel}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="warning">{translate(readinessKey)}</Badge>
          {health ? (
            <span className="text-xs text-muted-foreground">
              {translate('score', { score: health.score })}
            </span>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {translate('readiness')}
          </p>
          <p className="text-sm">
            {translate('currentDay', { day: model.currentDay })}
            <span className="text-muted-foreground"> · </span>
            {model.currentPhaseTitle}
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {translate('progress', {
              completed: model.progress.completed,
              total: model.progress.total,
            })}
          </p>
          <Progress
            aria-label={translate('progress', {
              completed: model.progress.completed,
              total: model.progress.total,
            })}
            value={model.progress.percent}
          />
        </div>
      </div>

      {model.nextAction ? (
        <div className="rounded-md bg-background-secondary px-3 py-2">
          <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {translate('nextAction')}
          </p>
          <Button
            className="mt-1 h-auto px-0 text-left text-sm"
            onClick={() => handleFocusCheck(model.nextAction?.id ?? '')}
            size={ButtonSize.SM}
            variant={ButtonVariant.LINK}
          >
            {model.nextAction.title}
          </Button>
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        {lastRefreshLabel
          ? translate('lastRefresh', { time: lastRefreshLabel })
          : translate('lastRefreshUnknown')}
      </p>

      {signalsError ? (
        <Alert variant="destructive">
          <AlertDescription>{signalsError}</AlertDescription>
        </Alert>
      ) : null}

      {health?.override.isActive ? (
        <Alert variant="info">
          <AlertTitle>{translate('unresolved')}</AlertTitle>
          <AlertDescription>
            {health.override.reason}
            {health.override.expiresAt
              ? ` · ${formatRefreshTime(health.override.expiresAt)}`
              : ''}
          </AlertDescription>
        </Alert>
      ) : null}

      {health?.holdPublishing || model.unresolvedChecks.length > 0 ? (
        <Alert variant="warning">
          <AlertTitle>
            {health?.holdPublishing
              ? translate('holdTitle')
              : translate('unresolved')}
          </AlertTitle>
          <AlertDescription className="space-y-2">
            {health?.holdPublishing ? (
              <p>{health.holdReason ?? translate('holdDescription')}</p>
            ) : null}
            <ul className="space-y-1">
              {model.unresolvedChecks.map((check) => (
                <li key={check.id}>
                  <Button
                    className="h-auto px-0 text-left text-xs"
                    onClick={() => handleFocusCheck(check.id)}
                    size={ButtonSize.SM}
                    variant={ButtonVariant.LINK}
                  >
                    {translate('focusCheck', { title: check.title })}
                  </Button>
                </li>
              ))}
            </ul>
            {health?.holdPublishing && onOverrideRequest ? (
              <Button
                onClick={() =>
                  onOverrideRequest({
                    credentialId: connection.credentialId,
                    unresolvedChecks: model.unresolvedChecks.map((check) => ({
                      id: check.id,
                      title: check.title,
                    })),
                  })
                }
                size={ButtonSize.SM}
                variant={ButtonVariant.SECONDARY}
              >
                {translate('override')}
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <Tabs
        onValueChange={(nextView) => {
          if (nextView === 'today' || nextView === 'full') {
            setView(nextView);
          }
        }}
        value={view}
      >
        <TabsList aria-label={translate('programTitle')}>
          <TabsTrigger data-size={isCompact ? 'sm' : 'md'} value="today">
            {translate('today')}
          </TabsTrigger>
          <TabsTrigger data-size={isCompact ? 'sm' : 'md'} value="full">
            {translate('fullBlueprint')}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="today" className="space-y-2">
          {model.todayChecks.map((check) => (
            <SocialWarmupCheckItem
              check={check}
              focusedCheckId={focusedCheckId}
              isPending={pendingItemId === check.id}
              key={check.id}
              onComplete={handleComplete}
              onReconnect={
                onReconnect ? () => onReconnect(platform) : undefined
              }
              onRefreshSignals={
                canRefreshAuthorizedSignals(platform)
                  ? handleRefreshSignals
                  : undefined
              }
              onReopen={handleReopen}
            />
          ))}
        </TabsContent>
        <TabsContent value="full" className="space-y-4">
          {blueprint.phases.map((phase) => {
            const phaseChecks = fullChecks.filter(
              (check) => check.phaseId === phase.id,
            );
            return (
              <section className="space-y-2" key={phase.id}>
                <div>
                  <h4 className="text-sm font-medium">{phase.title}</h4>
                  <p className="text-xs text-muted-foreground">
                    {phase.description}
                  </p>
                </div>
                {phaseChecks.map((check) => (
                  <SocialWarmupCheckItem
                    check={check}
                    focusedCheckId={focusedCheckId}
                    isPending={pendingItemId === check.id}
                    key={check.id}
                    onComplete={handleComplete}
                    onReconnect={
                      onReconnect ? () => onReconnect(platform) : undefined
                    }
                    onRefreshSignals={
                      canRefreshAuthorizedSignals(platform)
                        ? handleRefreshSignals
                        : undefined
                    }
                    onReopen={handleReopen}
                  />
                ))}
              </section>
            );
          })}
          <section className="space-y-2">
            <h4 className="text-sm font-medium">{translate('graduation')}</h4>
            <p className="text-xs text-muted-foreground">
              {blueprint.graduation.disclaimer}
            </p>
            {fullChecks
              .filter((check) => check.kind === 'graduation')
              .map((check) => (
                <SocialWarmupCheckItem
                  check={check}
                  focusedCheckId={focusedCheckId}
                  isPending={pendingItemId === check.id}
                  key={check.id}
                  onComplete={handleComplete}
                  onReconnect={
                    onReconnect ? () => onReconnect(platform) : undefined
                  }
                  onRefreshSignals={
                    canRefreshAuthorizedSignals(platform)
                      ? handleRefreshSignals
                      : undefined
                  }
                  onReopen={handleReopen}
                />
              ))}
          </section>
        </TabsContent>
      </Tabs>
    </section>
  );
}
