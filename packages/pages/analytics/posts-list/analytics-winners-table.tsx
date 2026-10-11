'use client';

import type {
  IWinnerPost,
  WinnerSignalEvidence,
} from '@genfeedai/contracts/interfaces';
import type { AnalyticsWinnersTableProps } from '@props/analytics/analytics-winners-table.props';
import type { TableColumn } from '@props/ui/display/table.props';
import Badge from '@ui/display/badge/Badge';
import Table from '@ui/display/table/Table';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

function formatSignalValue(evidence: WinnerSignalEvidence, value: number) {
  return evidence.signal === 'engagementRate'
    ? `${value.toFixed(2)}%`
    : Math.round(value).toLocaleString();
}

function matchesSearch(winner: IWinnerPost, search: string): boolean {
  const normalized = search.trim().toLowerCase();
  if (!normalized) return true;
  return (
    winner.postId === normalized ||
    [winner.label, winner.description, winner.brandName, winner.platform].some(
      (field) => (field ?? '').toLowerCase().includes(normalized),
    )
  );
}

/**
 * #5502 the Winners view of Analytics Posts: each row names the signals that
 * beat the account baseline, with the value, baseline and sample behind it.
 */
export default function AnalyticsWinnersTable({
  winners,
  search,
  isLoading,
  hasError,
  onRetry,
  onSelectPost,
}: AnalyticsWinnersTableProps) {
  const translate = useTranslations('pages.analytics.winners');

  const items = useMemo(
    () => winners.filter((winner) => matchesSearch(winner, search)),
    [search, winners],
  );

  const columns: TableColumn<IWinnerPost>[] = useMemo(
    () => [
      {
        header: translate('columns.post'),
        key: 'label',
        render: (winner) => (
          <div className="flex flex-col">
            <span className="font-medium line-clamp-1">
              {winner.label || winner.description || translate('untitled')}
            </span>
            <span className="text-xs text-foreground/60">
              {winner.brandName
                ? `${winner.brandName} · ${winner.platform}`
                : winner.platform}
            </span>
          </div>
        ),
      },
      {
        header: translate('columns.evidence'),
        key: 'evidence',
        render: (winner) => (
          <ul className="flex flex-col gap-1">
            {winner.evidence.map((evidence) => (
              <li
                key={evidence.signal}
                className="flex flex-wrap items-center gap-2 text-xs"
              >
                <Badge
                  variant={evidence.tier === 'breakout' ? 'success' : 'info'}
                >
                  {translate(`tiers.${evidence.tier}`)}
                </Badge>
                <span>
                  {translate('evidence', {
                    baseline: formatSignalValue(evidence, evidence.baseline),
                    ratio: evidence.ratio.toFixed(1),
                    sampleSize: evidence.sampleSize,
                    signal: translate(`signals.${evidence.signal}`),
                    value: formatSignalValue(evidence, evidence.value),
                  })}
                </span>
              </li>
            ))}
          </ul>
        ),
      },
    ],
    [translate],
  );

  return (
    <Table<IWinnerPost>
      label={translate('tableLabel')}
      items={items}
      isLoading={isLoading}
      error={hasError ? { title: translate('loadError'), onRetry } : undefined}
      columns={columns}
      emptyLabel={translate('empty')}
      getRowKey={(winner) => `${winner.postId}:${winner.platform}`}
      onRowClick={(winner) => onSelectPost(winner.postId)}
    />
  );
}
