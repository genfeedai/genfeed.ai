'use client';

import { getPlatformIcon } from '@helpers/ui/platform-icon/platform-icon.helper';
import type { CorpusHealthPanelProps } from '@props/trends/corpus-health-panel.props';
import type { TrendCorpusFreshnessStatus } from '@props/trends/trends-page.props';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import InsetSurface from '@ui/display/inset-surface/InsetSurface';
import MetricItem from '@ui/display/metric-item/MetricItem';
import { Text } from '@ui/typography/text';
import { useTranslations } from 'next-intl';

const PLATFORM_LABELS: Record<string, string> = {
  reddit: 'Reddit',
  tiktok: 'TikTok',
  twitter: 'X / Twitter',
};

type CorpusStatus = TrendCorpusFreshnessStatus | 'unavailable';

const SEGMENT_BADGE_VARIANT: Record<
  TrendCorpusFreshnessStatus,
  'success' | 'warning' | 'error'
> = {
  degraded: 'warning',
  empty: 'error',
  healthy: 'success',
  stale: 'warning',
};

function normalizePlatform(platform: string): string {
  const normalized = platform.toLowerCase();
  return normalized === 'x' ? 'twitter' : normalized;
}

function formatPlatformLabel(platform: string): string {
  return (
    PLATFORM_LABELS[platform] ??
    platform.charAt(0).toUpperCase() + platform.slice(1)
  );
}

function formatProviderLabel(provider: string): string {
  return provider
    .split(/[_-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatTimestamp(timestamp: string | null | undefined): string | null {
  if (!timestamp) {
    return null;
  }
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return timestamp;
  }
  return parsed.toLocaleString(undefined, {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  });
}

/**
 * Source health summary for the trend corpus. One compact status row per
 * platform, built from the shared Card / InsetSurface / MetricItem primitives
 * so it reads like every other status card in the app.
 */
export default function CorpusHealthPanel({
  health,
  isUnavailable = false,
  selectedPlatforms = [],
}: CorpusHealthPanelProps) {
  const translate = useTranslations('pages.analytics.trends.corpusHealth');
  const platforms = Array.from(
    new Set(
      (selectedPlatforms.length > 0
        ? selectedPlatforms
        : [
            'twitter',
            'reddit',
            'tiktok',
            ...(health?.summary.platforms ?? []),
            ...(health?.segments.map(({ platform }) => platform) ?? []),
            ...(health?.providerFailures.map(({ platform }) => platform) ?? []),
          ]
      ).map(normalizePlatform),
    ),
  );
  const scopedSegments =
    health?.segments.filter((segment) =>
      platforms.includes(normalizePlatform(segment.platform)),
    ) ?? [];
  const hasFailures =
    health?.providerFailures.some((failure) =>
      platforms.includes(normalizePlatform(failure.platform)),
    ) ?? false;
  const hasMissingCoverage = platforms.some(
    (platform) =>
      !scopedSegments.some(
        (segment) => normalizePlatform(segment.platform) === platform,
      ),
  );
  const status: CorpusStatus | undefined = isUnavailable
    ? 'unavailable'
    : !health
      ? undefined
      : hasFailures ||
          scopedSegments.some((segment) => segment.status === 'degraded')
        ? 'degraded'
        : health.status === 'empty' && scopedSegments.length === 0
          ? 'empty'
          : hasMissingCoverage
            ? 'unavailable'
            : scopedSegments.some((segment) => segment.status === 'stale')
              ? 'stale'
              : scopedSegments.some((segment) => segment.status === 'empty')
                ? 'empty'
                : 'healthy';
  const variant =
    status === 'healthy'
      ? 'success'
      : status === 'stale' || status === 'degraded'
        ? 'warning'
        : status === 'empty' || status === 'unavailable'
          ? 'error'
          : 'default';
  const notRecorded = translate('notRecorded');

  return (
    <section aria-label={translate('title')} className="mb-4">
      <Card
        description={
          isUnavailable
            ? translate('unavailableDescription')
            : translate('description')
        }
        headerAction={
          <div role="status">
            <Badge variant={variant}>
              {status
                ? translate(`corpusStatus.${status}`)
                : translate('checkingCorpus')}
            </Badge>
          </div>
        }
        label={translate('title')}
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {platforms.map((platform) => {
            const segments =
              health?.segments.filter(
                (segment) => normalizePlatform(segment.platform) === platform,
              ) ?? [];
            const failures =
              health?.providerFailures.filter(
                (failure) => normalizePlatform(failure.platform) === platform,
              ) ?? [];
            const label = formatPlatformLabel(platform);
            const isChecking = !health && !isUnavailable;
            const hasSegments = !isUnavailable && segments.length > 0;
            const latestSeenAt = segments
              .map((segment) => segment.latestSeenAt ?? null)
              .filter((value): value is string => Boolean(value))
              .sort()
              .at(-1);

            return (
              <InsetSurface
                aria-label={label}
                className="flex flex-col gap-3"
                density="compact"
                key={platform}
                role="group"
                tone="muted"
              >
                <div className="flex items-center gap-2">
                  {getPlatformIcon(platform, 'size-4 shrink-0')}
                  <Text
                    as="p"
                    className="min-w-0 flex-1 truncate"
                    size="sm"
                    weight="semibold"
                  >
                    {label}
                  </Text>
                  {!hasSegments ? (
                    <Badge variant={isChecking ? 'default' : 'ghost'}>
                      {isChecking
                        ? translate('checkingHealth')
                        : translate('unavailableHealth')}
                    </Badge>
                  ) : null}
                </div>

                {hasSegments ? (
                  <ul className="flex flex-col gap-1.5">
                    {segments.map((segment) => (
                      <li
                        className="flex items-center justify-between gap-2"
                        key={segment.id}
                      >
                        <Text as="span" className="truncate" size="sm">
                          {formatProviderLabel(segment.provider)}
                        </Text>
                        <Badge variant={SEGMENT_BADGE_VARIANT[segment.status]}>
                          {translate(`status.${segment.status}`)}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                ) : health && !isUnavailable ? (
                  <Text as="p" color="subtle-60" size="xs">
                    {translate('missingHealth')}
                  </Text>
                ) : null}

                {failures.map((failure) => (
                  <Text
                    as="p"
                    color="destructive"
                    key={`${failure.provider}:${failure.reason}`}
                    size="xs"
                  >
                    {formatProviderLabel(failure.provider)}:{' '}
                    {translate(`failure.${failure.reason}`)}
                    {failure.latestObservedAt
                      ? ` · ${formatTimestamp(failure.latestObservedAt)}`
                      : ''}
                  </Text>
                ))}

                <div className="grid grid-cols-3 gap-2 border-t border-border pt-3">
                  <MetricItem
                    label={translate('sourceTimestampLabel')}
                    value={formatTimestamp(latestSeenAt) ?? notRecorded}
                  />
                  <MetricItem
                    label={translate('lastRefreshLabel')}
                    value={notRecorded}
                  />
                  <MetricItem
                    label={translate('lastAttemptLabel')}
                    value={notRecorded}
                  />
                </div>
              </InsetSurface>
            );
          })}
        </div>
      </Card>
    </section>
  );
}
