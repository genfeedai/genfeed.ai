'use client';

import type { CorpusHealthPanelProps } from '@props/trends/corpus-health-panel.props';
import Badge from '@ui/display/badge/Badge';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import { useTranslations } from 'next-intl';

const PLATFORM_LABELS: Record<string, string> = {
  reddit: 'Reddit',
  tiktok: 'TikTok',
  twitter: 'X / Twitter',
};
function normalizePlatform(platform: string): string {
  const normalized = platform.toLowerCase();
  return normalized === 'x' ? 'twitter' : normalized;
}

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
  const status = isUnavailable
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

  return (
    <section
      aria-label={translate('title')}
      className="mb-4 space-y-3 rounded-lg border border-border p-4"
    >
      <div role="status" className="space-y-2">
        <Heading as="h2" size="sm">
          {translate('title')}
        </Heading>
        <Badge variant={variant}>
          {status
            ? translate(`corpusStatus.${status}`)
            : translate('checkingCorpus')}
        </Badge>
        <Text size="sm" color="subtle-60">
          {isUnavailable
            ? translate('unavailableDescription')
            : translate('description')}
        </Text>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {platforms.map((platform) => {
          const segments =
            health?.segments.filter(
              (segment) => normalizePlatform(segment.platform) === platform,
            ) ?? [];
          const failures =
            health?.providerFailures.filter(
              (failure) => normalizePlatform(failure.platform) === platform,
            ) ?? [];
          const label = PLATFORM_LABELS[platform] ?? platform;
          return (
            <div
              key={platform}
              role="group"
              aria-label={label}
              className="space-y-2 rounded-md border border-border p-3"
            >
              <Heading as="h3" size="sm">
                {label}
              </Heading>
              {isUnavailable || segments.length === 0 ? (
                <div className="space-y-1">
                  <Text size="sm">
                    {!health && !isUnavailable
                      ? translate('checkingHealth')
                      : translate('unavailableHealth')}
                  </Text>
                  {health && !isUnavailable && segments.length === 0 ? (
                    <Text size="xs" color="subtle-60">
                      {translate('missingHealth')}
                    </Text>
                  ) : null}
                </div>
              ) : null}
              {segments.length === 0 ? (
                <Text size="xs" color="subtle-60">
                  {translate('sourceTimestamp', {
                    timestamp: translate('notRecorded'),
                  })}
                </Text>
              ) : null}
              {segments.map((segment) => (
                <div key={segment.id} className="space-y-1">
                  <Text size="sm">
                    {segment.provider}: {translate(`status.${segment.status}`)}
                  </Text>
                  <Text size="xs" color="subtle-60">
                    {translate('sourceTimestamp', {
                      timestamp:
                        segment.latestSeenAt ?? translate('notRecorded'),
                    })}
                  </Text>
                </div>
              ))}
              {failures.map((failure) => (
                <div
                  key={`${failure.provider}:${failure.reason}`}
                  className="space-y-1"
                >
                  <Text size="sm">
                    {failure.provider}: {translate(`failure.${failure.reason}`)}
                  </Text>
                  <Text size="xs" color="subtle-60">
                    {translate('previewTimestamp', {
                      timestamp:
                        failure.latestObservedAt ?? translate('notRecorded'),
                    })}
                  </Text>
                </div>
              ))}
              <Text size="xs" color="subtle-60">
                {translate('lastRefresh')}
              </Text>
              <Text size="xs" color="subtle-60">
                {translate('lastAttempt')}
              </Text>
            </div>
          );
        })}
      </div>
    </section>
  );
}
