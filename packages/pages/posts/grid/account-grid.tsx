'use client';

import {
  ButtonSize,
  ButtonVariant,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type {
  AccountHealthSummary,
  IChannelTarget,
  IClockTime,
  IReleaseGroup,
} from '@genfeedai/contracts/interfaces';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { cn } from '@helpers/formatting/cn/cn.util';
import { formatDateInTimezone } from '@helpers/formatting/timezone/timezone.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import {
  accountLabel,
  buildAccountGridLanes,
  isTargetPublished,
} from '@pages/posts/grid/account-grid.helpers';
import type {
  AccountGridLaneColumnProps,
  AccountGridProps,
  AccountGridTileProps,
} from '@props/publisher/account-grid.props';
import { logger } from '@services/core/logger.service';
import { CredentialsService } from '@services/organization/credentials.service';
import CardEmpty from '@ui/card/empty/CardEmpty';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import Loading from '@ui/loading/default/Loading';
import TargetPreview from '@ui/previews/TargetPreview';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

function tileTone(
  target: IChannelTarget,
): 'failed' | 'published' | 'review' | 'upcoming' {
  if (target.executionState === TargetExecutionState.FAILED) {
    return 'failed';
  }
  if (target.executionState === TargetExecutionState.PAUSED) {
    return 'review';
  }
  if (isTargetPublished(target)) {
    return 'published';
  }
  return 'upcoming';
}

function mediaUrl(release: IReleaseGroup): string | undefined {
  return release.media?.[0]?.url ?? undefined;
}

function AccountGridTile({
  browserTimezone,
  item,
  lane,
  onSelectRelease,
}: AccountGridTileProps) {
  const translate = useTranslations('pages.posts.grid');

  if (item.kind === 'gap' && item.gapAt) {
    return (
      <div
        className="flex aspect-square flex-col items-center justify-center border border-dashed border-border bg-muted/40 p-2 text-center text-xs text-muted-foreground"
        data-testid="account-grid-gap"
      >
        <span>{translate('gapLabel')}</span>
        <span className="mt-1 font-medium text-foreground">
          {formatDateInTimezone(item.gapAt, browserTimezone, 'short')}
        </span>
      </div>
    );
  }

  if (!item.release || !item.target) {
    return null;
  }

  const { release, target } = item;
  const tone = tileTone(target);
  const title = release.title || translate('untitled');
  const when = target.scheduledAt ?? target.publishedAt ?? release.scheduledAt;
  const thumbnail = mediaUrl(release);

  if (lane.kind === 'cards') {
    return (
      <div
        aria-label={title}
        className="cursor-pointer text-left"
        data-testid="account-grid-tile"
        onClick={() => onSelectRelease(release.id)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onSelectRelease(release.id);
          }
        }}
        role="button"
        tabIndex={0}
      >
        <TargetPreview
          credential={target.credential ?? lane.credential}
          release={release}
          target={target}
        />
      </div>
    );
  }

  const aspectClass =
    lane.kind === 'portrait'
      ? 'aspect-[9/16]'
      : lane.kind === 'landscape'
        ? 'aspect-video'
        : 'aspect-square';

  return (
    <Button
      ariaLabel={title}
      className={cn(
        'relative block w-full overflow-hidden border bg-muted text-left',
        aspectClass,
        tone === 'failed' && 'border-destructive',
        tone === 'review' && 'border-warning',
        tone === 'upcoming' && 'border-dashed border-border',
        tone === 'published' && 'border-border',
      )}
      data-testid="account-grid-tile"
      onClick={() => onSelectRelease(release.id)}
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
    >
      {thumbnail ? (
        <img alt="" className="size-full object-cover" src={thumbnail} />
      ) : (
        <span className="flex size-full items-center p-2 text-xs text-foreground/70">
          {title}
        </span>
      )}
      <span className="absolute inset-x-0 bottom-0 bg-black/55 px-2 py-1 text-[10px] text-white">
        {tone === 'review'
          ? translate('review')
          : tone === 'failed'
            ? translate('failed')
            : when
              ? formatDateInTimezone(when, browserTimezone, 'short')
              : title}
      </span>
    </Button>
  );
}

function AccountGridLaneColumn({
  browserTimezone,
  lane,
  onSelectRelease,
  reconnectHref,
}: AccountGridLaneColumnProps) {
  const translate = useTranslations('pages.posts.grid');
  const needsReconnect = Boolean(lane.account.reconnect?.isAvailable);
  const layoutClass =
    lane.kind === 'grid'
      ? 'grid grid-cols-3 gap-1'
      : lane.kind === 'portrait'
        ? 'grid grid-cols-2 gap-2'
        : 'flex flex-col gap-3';

  return (
    <section
      aria-label={accountLabel(lane.account)}
      className="flex min-w-72 flex-1 flex-col border border-border bg-card"
      data-testid="account-grid-lane"
    >
      <header className="flex items-start gap-3 border-b border-border px-3 py-3">
        <PlatformBadge platform={lane.account.platform} showLabel={false} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {accountLabel(lane.account)}
          </p>
          <p className="text-xs text-muted-foreground">
            {translate('queued', { count: lane.queuedCount })}
          </p>
        </div>
        {lane.account.holdPublishing ? (
          <Badge variant="warning">{translate('hold')}</Badge>
        ) : null}
      </header>

      <div className="flex flex-col gap-3 p-3">
        {needsReconnect ? (
          <div className="flex flex-col gap-2 border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            <p>{translate('expiredToken')}</p>
            <Button asChild size={ButtonSize.SM} withWrapper={false}>
              <Link href={reconnectHref}>{translate('reconnect')}</Link>
            </Button>
          </div>
        ) : null}

        {lane.items.length > 0 ? (
          <div className={layoutClass}>
            {lane.items.map((item, index) => (
              <AccountGridTile
                browserTimezone={browserTimezone}
                item={item}
                key={
                  item.kind === 'gap'
                    ? `gap-${item.gapAt}`
                    : `${item.release?.id}-${item.target?.id}-${index}`
                }
                lane={lane}
                onSelectRelease={onSelectRelease}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {translate('emptyLane')}
          </p>
        )}
      </div>
    </section>
  );
}

export default function AccountGrid({
  brandId,
  browserTimezone,
  isLoading,
  onSelectRelease,
  reconnectHref,
  releases,
  selectedCredentialIds,
}: AccountGridProps) {
  const translate = useTranslations('pages.posts.grid');
  const { getToken } = useAuthIdentity();
  const [accounts, setAccounts] = useState<AccountHealthSummary[]>([]);
  const [postingTimesByCredential, setPostingTimesByCredential] = useState<
    Record<string, IClockTime[]>
  >({});
  const [isAccountsLoading, setIsAccountsLoading] = useState(false);
  const now = useMemo(() => new Date(), []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadAccounts() {
      if (!brandId) {
        setAccounts([]);
        return;
      }

      setIsAccountsLoading(true);
      try {
        const token = (await resolveAuthToken(getToken)) ?? '';
        if (controller.signal.aborted) {
          return;
        }
        const service = CredentialsService.getInstance(token);
        const summaries = await service.listBrandAccountHealth(brandId);
        if (!controller.signal.aborted) {
          setAccounts(summaries);
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }
        if (!controller.signal.aborted) {
          logger.error('Failed to load account grid health', error);
          setAccounts([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsAccountsLoading(false);
        }
      }
    }

    void loadAccounts();
    return () => controller.abort();
  }, [brandId, getToken]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadPostingTimes() {
      if (accounts.length === 0) {
        setPostingTimesByCredential({});
        return;
      }

      try {
        const token = (await resolveAuthToken(getToken)) ?? '';
        if (controller.signal.aborted) {
          return;
        }
        const service = CredentialsService.getInstance(token);
        const entries = await Promise.all(
          accounts.map(async (account) => {
            try {
              const times = await service.listPostingTimes(
                account.credentialId,
                controller.signal,
              );
              return [account.credentialId, times] as const;
            } catch {
              return [account.credentialId, [] as IClockTime[]] as const;
            }
          }),
        );
        if (!controller.signal.aborted) {
          setPostingTimesByCredential(Object.fromEntries(entries));
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }
        if (!controller.signal.aborted) {
          logger.error('Failed to load account grid posting times', error);
        }
      }
    }

    void loadPostingTimes();
    return () => controller.abort();
  }, [accounts, getToken]);

  const lanes = useMemo(
    () =>
      buildAccountGridLanes({
        accounts,
        now,
        postingTimesByCredential,
        releases,
        selectedCredentialIds,
        timezone: browserTimezone,
      }),
    [
      accounts,
      browserTimezone,
      now,
      postingTimesByCredential,
      releases,
      selectedCredentialIds,
    ],
  );

  if ((isLoading || isAccountsLoading) && lanes.length === 0) {
    return <Loading isFullSize={false} />;
  }

  if (lanes.length === 0) {
    return (
      <CardEmpty
        description={translate('emptyDescription')}
        label={translate('emptyLabel')}
      />
    );
  }

  return (
    <div
      className="flex gap-3 overflow-x-auto pb-2"
      data-testid="publishing-account-grid"
    >
      {lanes.map((lane) => (
        <AccountGridLaneColumn
          browserTimezone={browserTimezone}
          key={lane.account.credentialId}
          lane={lane}
          onSelectRelease={onSelectRelease}
          reconnectHref={reconnectHref}
        />
      ))}
    </div>
  );
}
