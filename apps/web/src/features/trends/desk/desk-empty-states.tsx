'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { TrendsSummary } from '@props/trends/trends-page.props';
import MetricCard from '@ui/cards/metric-card/MetricCard';
import { MetricCardGrid } from '@ui/cards/metric-card/MetricCardGrid';
import { Button } from '@ui/primitives/button';
import { EmptyStateCard } from '@ui/primitives/empty-state';
import { Activity, AtSign, Link2, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

/**
 * Readiness metrics shown while the Desk has zero items — ported verbatim
 * from the retired trends-list.tsx (`DiscoveryReadinessCards`).
 */
export function DiscoveryReadinessCards({
  summary,
}: {
  summary: TrendsSummary;
}) {
  return (
    <MetricCardGrid className="mb-5" columns={3}>
      <MetricCard
        label="Source coverage"
        value={summary.connectedPlatforms.length}
        size="sm"
      />
      <MetricCard
        label="Locked sources"
        value={summary.lockedPlatforms.length}
        size="sm"
      />
      <MetricCard
        label="Feed state"
        value={summary.totalItems ? 'Ready' : 'Waiting'}
        size="sm"
      />
    </MetricCardGrid>
  );
}

/**
 * The Desk's "nothing here" state. Mirrors the retired
 * `TrendContentEmptyState`, corrected: the Following link is now
 * `${OVERVIEW}?source=following` (brand-scoped `href`) since Discovery no
 * longer has a standalone `/discovery/following` route.
 */
export function DeskEmptyState({
  followingHref,
  hasSearch,
  isRefreshing,
  onClearSearch,
  onRefresh,
  publishingHref,
  sourceHealthHref,
}: {
  followingHref: string;
  hasSearch: boolean;
  isRefreshing: boolean;
  onClearSearch: () => void;
  onRefresh: () => void;
  publishingHref: string;
  sourceHealthHref: string;
}) {
  const translateDesk = useTranslations('common.trends.desk');

  if (hasSearch) {
    return (
      <EmptyStateCard
        icon={TrendingUp}
        title="No matching signals"
        action={{
          label: 'Clear search',
          onClick: onClearSearch,
        }}
      />
    );
  }

  return (
    <EmptyStateCard
      actions={
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          <Button
            asChild
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
          >
            <Link href={publishingHref}>
              <Link2 className="size-3.5" />
              {translateDesk('emptyState.connectAccounts')}
            </Link>
          </Button>
          <Button asChild size={ButtonSize.SM} variant={ButtonVariant.GHOST}>
            <Link href={followingHref}>
              <AtSign className="size-3.5" />
              {translateDesk('emptyState.followCreators')}
            </Link>
          </Button>
          <Button asChild size={ButtonSize.SM} variant={ButtonVariant.GHOST}>
            <Link href={sourceHealthHref}>
              <Activity className="size-3.5" />
              {translateDesk('emptyState.checkSourceHealth')}
            </Link>
          </Button>
          <Button
            isLoading={isRefreshing}
            label="Refresh"
            onClick={onRefresh}
            size={ButtonSize.SM}
            variant={ButtonVariant.GHOST}
          />
        </div>
      }
      icon={TrendingUp}
      title="No saved posts yet"
    />
  );
}
