'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { TrendsSummary } from '@props/trends/trends-page.props';
import CardEmpty from '@ui/card/empty/CardEmpty';
import MetricCard from '@ui/cards/metric-card/MetricCard';
import { MetricCardGrid } from '@ui/cards/metric-card/MetricCardGrid';
import { EmptyStateCard } from '@ui/feedback';
import { Button } from '@ui/primitives/button';
import { AtSign, Link2, TrendingUp } from 'lucide-react';
import Link from 'next/link';

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
        description="Platforms currently contributing source-post signals."
        size="sm"
      />
      <MetricCard
        label="Locked sources"
        value={summary.lockedPlatforms.length}
        description="Platforms waiting for access before they can add signals."
        size="sm"
      />
      <MetricCard
        label="Feed state"
        value={summary.totalItems ? 'Ready' : 'Waiting'}
        description="Discovery is populated from saved trend sync output."
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
}: {
  followingHref: string;
  hasSearch: boolean;
  isRefreshing: boolean;
  onClearSearch: () => void;
  onRefresh: () => void;
  publishingHref: string;
}) {
  if (hasSearch) {
    return (
      <EmptyStateCard
        icon={TrendingUp}
        title="No matching signals"
        description="Nothing on the Desk matches that search or filter combination."
        action={{
          label: 'Clear search',
          onClick: onClearSearch,
        }}
      />
    );
  }

  return (
    <CardEmpty
      actions={
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          <Button
            asChild
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
          >
            <Link href={publishingHref}>
              <Link2 className="size-3.5" />
              Connect accounts
            </Link>
          </Button>
          <Button asChild size={ButtonSize.SM} variant={ButtonVariant.GHOST}>
            <Link href={followingHref}>
              <AtSign className="size-3.5" />
              Follow creators
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
      description="The Desk stays empty until you connect publishing accounts or follow creators. No fake demo corpus — only signals you actually own."
      icon={TrendingUp}
      label="Warm this workspace with real sources"
    />
  );
}
