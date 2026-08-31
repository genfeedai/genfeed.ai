'use client';

import { formatCompactNumber } from '@helpers/formatting/format/format.helper';
import type {
  TrendCorpusFreshnessHealth,
  TrendCorpusFreshnessStatus,
} from '@props/trends/trends-page.props';
import Badge from '@ui/display/badge/Badge';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';

type Props = {
  corpusHealth: TrendCorpusFreshnessHealth | null;
  formattedLastSyncedAt: string;
  videoCount: number;
  platformCount: number;
  leadingPlatform: { label: string; totalMentions: number } | null;
  totalTrackedTopics: number;
};

type CorpusStatusView = {
  detail: string;
  label: string;
  variant: 'default' | 'error' | 'success' | 'warning';
};

const STATUS_VIEW: Record<TrendCorpusFreshnessStatus, CorpusStatusView> = {
  degraded: {
    detail: '',
    label: 'Trend corpus degraded',
    variant: 'warning',
  },
  empty: {
    detail: 'Scheduled ingestion has not produced trend data yet.',
    label: 'Trend corpus empty',
    variant: 'error',
  },
  healthy: {
    detail: '',
    label: 'Trend corpus healthy',
    variant: 'success',
  },
  stale: {
    detail: 'Cached trends are available, but their sources are stale.',
    label: 'Trend corpus stale',
    variant: 'warning',
  },
};

function getCorpusStatusView(
  corpusHealth: TrendCorpusFreshnessHealth | null,
  formattedLastSyncedAt: string,
): CorpusStatusView {
  if (!corpusHealth) {
    return {
      detail: 'Checking scheduled ingestion status.',
      label: 'Checking trend corpus',
      variant: 'default',
    };
  }

  const view = STATUS_VIEW[corpusHealth.status];
  if (corpusHealth.status === 'degraded') {
    const affected = corpusHealth.providerFailures
      .map(
        ({ platform, provider, reason }) =>
          `${platform} (${provider}: ${reason.replaceAll('_', ' ')})`,
      )
      .join(', ');
    const lastSuccess = formattedLastSyncedAt
      ? ` Last successful refresh ${formattedLastSyncedAt}.`
      : ' No successful refresh has been recorded.';
    return {
      ...view,
      detail: `Affected: ${affected || 'provider status unavailable'}. Cached trends remain available.${lastSuccess}`,
    };
  }
  if (corpusHealth.status === 'healthy') {
    const { activeTrends, platforms } = corpusHealth.summary;
    return {
      ...view,
      detail: `${activeTrends} active trend${activeTrends === 1 ? '' : 's'} across ${platforms.length} platform${platforms.length === 1 ? '' : 's'}.`,
    };
  }

  return view;
}

export default function TrendsPageHeader({
  corpusHealth,
  formattedLastSyncedAt,
  videoCount,
  platformCount,
  leadingPlatform,
  totalTrackedTopics,
}: Props) {
  const corpusStatus = getCorpusStatusView(corpusHealth, formattedLastSyncedAt);

  return (
    <header>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Badge
            variant={corpusStatus.variant}
            className="text-xs uppercase tracking-wide"
          >
            {corpusStatus.label}
          </Badge>

          <Text size="sm" color="subtle-60">
            {corpusStatus.detail}
          </Text>

          {formattedLastSyncedAt && (
            <Text size="sm" color="subtle-60">
              Last updated {formattedLastSyncedAt}
            </Text>
          )}

          <Text size="sm" color="subtle-60">
            Tracking {videoCount} standout videos across {platformCount}{' '}
            platforms
          </Text>

          {leadingPlatform && leadingPlatform.totalMentions > 0 && (
            <Text size="sm" color="subtle-60">
              Highest term volume:{' '}
              <Text weight="semibold" color="default">
                {leadingPlatform.label}
              </Text>{' '}
              ({formatCompactNumber(leadingPlatform.totalMentions)} mentions)
            </Text>
          )}
          <Text size="sm" color="subtle-60">
            {totalTrackedTopics} active keywords monitored
          </Text>
        </div>
        <Heading size="2xl" as="h1" className="sr-only">
          Social Media Trends
        </Heading>
      </div>
    </header>
  );
}
