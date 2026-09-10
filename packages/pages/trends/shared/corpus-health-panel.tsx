'use client';

import { getPlatformIcon } from '@helpers/ui/platform-icon/platform-icon.helper';
import type { CorpusHealthPanelProps } from '@props/trends/corpus-health-panel.props';
import type { TrendCorpusFreshnessStatus } from '@props/trends/trends-page.props';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import { Text } from '@ui/typography/text';
import { useTranslations } from 'next-intl';

const PLATFORM_LABELS: Record<string, string> = {
  linkedin: 'LinkedIn',
  reddit: 'Reddit',
  tiktok: 'TikTok',
  twitter: 'X / Twitter',
};

const DEFAULT_PLATFORMS = ['twitter', 'reddit', 'tiktok'] as const;

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

function uniquePlatforms(platforms: readonly string[]): string[] {
  return Array.from(new Set(platforms.map(normalizePlatform)));
}

function resolvePlatformStatus(
  statuses: readonly TrendCorpusFreshnessStatus[],
): TrendCorpusFreshnessStatus | undefined {
  if (statuses.length === 0) {
    return undefined;
  }
  if (statuses.includes('degraded')) {
    return 'degraded';
  }
  if (statuses.includes('stale')) {
    return 'stale';
  }
  if (statuses.includes('empty')) {
    return 'empty';
  }
  return 'healthy';
}

// Backend timestamps render identically on the server and in the browser:
// a fixed locale and UTC keep hydration free of locale or zone drift.
const TIMESTAMP_FORMATTER = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  month: 'short',
  timeZone: 'UTC',
});

function formatTimestamp(timestamp: string | null | undefined): string | null {
  if (!timestamp) {
    return null;
  }
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return timestamp;
  }
  return TIMESTAMP_FORMATTER.format(parsed);
}

/**
 * Source health summary for the trend corpus. One compact status row per
 * platform inside the shared Card, with Badge status chips and a plain
 * label/value list — so it reads like every other status card in the app.
 */
export default function CorpusHealthPanel({
  health,
  isUnavailable = false,
  selectedPlatforms = [],
}: CorpusHealthPanelProps) {
  const translate = useTranslations('pages.analytics.trends.corpusHealth');
  const observedPlatforms = uniquePlatforms([
    ...(health?.summary.platforms ?? []),
    ...(health?.segments.map(({ platform }) => platform) ?? []),
    ...(health?.providerFailures.map(({ platform }) => platform) ?? []),
  ]);
  const platforms =
    selectedPlatforms.length > 0
      ? uniquePlatforms(selectedPlatforms)
      : observedPlatforms.length > 0
        ? observedPlatforms
        : [...DEFAULT_PLATFORMS];
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
        <ul className="divide-y divide-border">
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
            const platformStatus = resolvePlatformStatus(
              segments.map((segment) => segment.status),
            );
            const latestSeenAt = segments
              .map((segment) => segment.latestSeenAt ?? null)
              .filter((value): value is string => Boolean(value))
              .sort()
              .at(-1);

            return (
              <li
                aria-label={label}
                className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 md:flex-row md:items-baseline md:gap-4"
                key={platform}
                role="group"
              >
                {/* The icon identifies the platform; repeating the name beside
                    it is noise. The row keeps `aria-label` so assistive tech
                    still hears which platform this status belongs to. */}
                <div className="flex w-full items-center gap-2 md:w-10 md:shrink-0">
                  {getPlatformIcon(platform, 'size-4 shrink-0')}
                </div>

                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {hasSegments && platformStatus ? (
                      <Badge variant={SEGMENT_BADGE_VARIANT[platformStatus]}>
                        {label} · {translate(`status.${platformStatus}`)}
                      </Badge>
                    ) : (
                      <Badge variant={isChecking ? 'default' : 'ghost'}>
                        {isChecking
                          ? translate('checkingHealth')
                          : translate('unavailableHealth')}
                      </Badge>
                    )}
                  </div>
                  {!hasSegments && health && !isUnavailable ? (
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
                  <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    {[
                      ['sourceTimestampLabel', formatTimestamp(latestSeenAt)],
                      ['lastRefreshLabel', null],
                      ['lastAttemptLabel', null],
                    ].map(([key, value]) => (
                      <div className="flex items-baseline gap-1" key={key}>
                        <dt className="text-foreground/45">
                          {translate(key as string)}
                        </dt>
                        <dd className="tabular-nums text-foreground/75">
                          {value ?? notRecorded}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    </section>
  );
}
