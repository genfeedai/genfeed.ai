'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { SocialWarmupCheckItemProps } from '@props/social/social-warmup-program.props';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { useTranslations } from 'next-intl';

function provenanceVariant(
  provenance: SocialWarmupCheckItemProps['check']['provenance'],
): 'info' | 'secondary' | 'success' {
  if (provenance === 'platform_verified') {
    return 'info';
  }
  if (provenance === 'genfeed_observed') {
    return 'secondary';
  }
  return 'success';
}

function stateVariant(
  state: SocialWarmupCheckItemProps['check']['state'],
): 'default' | 'destructive' | 'secondary' | 'success' | 'warning' {
  if (state === 'complete') {
    return 'success';
  }
  if (state === 'stale' || state === 'permission_limited') {
    return 'warning';
  }
  if (state === 'failed' || state === 'reconnect') {
    return 'destructive';
  }
  if (state === 'loading') {
    return 'default';
  }
  return 'secondary';
}

export default function SocialWarmupCheckItem({
  check,
  focusedCheckId,
  isPending = false,
  onComplete,
  onReconnect,
  onRefreshSignals,
  onReopen,
}: SocialWarmupCheckItemProps) {
  const translate = useTranslations('pages.socialWarmup');
  const isFocused = focusedCheckId === check.id;
  const canMarkComplete =
    check.provenance === 'user_confirmed' && !check.isComplete;
  const canReopen = check.provenance === 'user_confirmed' && check.isComplete;
  const canRefresh =
    Boolean(onRefreshSignals) &&
    check.provenance !== 'user_confirmed' &&
    (check.state === 'stale' ||
      check.state === 'failed' ||
      check.state === 'missing' ||
      check.state === 'empty' ||
      check.state === 'loading');
  const canReconnect =
    Boolean(onReconnect) &&
    (check.state === 'reconnect' ||
      check.state === 'permission_limited' ||
      ((check.state === 'stale' || check.state === 'failed') &&
        !onRefreshSignals));
  const platformLabel = check.provenanceLabel.replace('Verified from ', '');
  const stateMessageKey =
    check.state === 'stale'
      ? 'checkStale'
      : check.state === 'permission_limited'
        ? 'checkPermissionLimited'
        : check.state === 'reconnect'
          ? 'checkReconnect'
          : check.state === 'loading'
            ? 'checkLoading'
            : check.state === 'empty'
              ? 'checkEmpty'
              : check.state === 'failed'
                ? 'checkFailed'
                : check.state === 'missing'
                  ? 'checkMissing'
                  : check.isComplete
                    ? 'checkComplete'
                    : 'checkOpen';
  const statusKey =
    check.state === 'complete'
      ? 'statusComplete'
      : check.state === 'stale'
        ? 'statusStale'
        : check.state === 'permission_limited'
          ? 'statusPermissionLimited'
          : check.state === 'reconnect'
            ? 'statusReconnect'
            : check.state === 'loading'
              ? 'statusLoading'
              : check.state === 'empty'
                ? 'statusEmpty'
                : check.state === 'failed'
                  ? 'statusFailed'
                  : check.state === 'missing'
                    ? 'statusMissing'
                    : 'statusOpen';

  return (
    <article
      aria-labelledby={`warmup-check-title-${check.id}`}
      className={`space-y-2 border-t border-border/70 py-3 first:border-t-0 ${
        isFocused ? 'bg-primary/5' : ''
      }`}
      data-state={check.state}
      id={`warmup-check-${check.id}`}
      tabIndex={-1}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <h4
            className="text-sm font-medium"
            id={`warmup-check-title-${check.id}`}
          >
            {check.title}
          </h4>
          <p className="text-xs leading-5 text-muted-foreground">
            {check.description}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          <Badge variant={provenanceVariant(check.provenance)}>
            {check.provenanceLabel}
          </Badge>
          <Badge variant={stateVariant(check.state)}>
            {translate(statusKey)}
          </Badge>
        </div>
      </div>

      {check.state !== 'open' && check.state !== 'complete' ? (
        <p className="text-xs leading-5 text-muted-foreground">
          {translate(stateMessageKey, { platform: platformLabel })}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {canMarkComplete ? (
          <Button
            aria-label={translate('markComplete')}
            isDisabled={isPending}
            isLoading={isPending}
            onClick={() => onComplete(check.id)}
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
          >
            {translate('markComplete')}
          </Button>
        ) : null}
        {canReopen ? (
          <Button
            aria-label={translate('reopen')}
            isDisabled={isPending}
            isLoading={isPending}
            onClick={() => onReopen(check.id)}
            size={ButtonSize.SM}
            variant={ButtonVariant.GHOST}
          >
            {translate('reopen')}
          </Button>
        ) : null}
        {canRefresh ? (
          <Button
            aria-label={translate('refreshSignals')}
            isDisabled={isPending || check.state === 'loading'}
            isLoading={check.state === 'loading'}
            onClick={onRefreshSignals}
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
          >
            {translate('refreshSignals')}
          </Button>
        ) : null}
        {canReconnect ? (
          <Button
            aria-label={translate('reconnect')}
            onClick={onReconnect}
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
          >
            {translate('reconnect')}
          </Button>
        ) : null}
      </div>
    </article>
  );
}
