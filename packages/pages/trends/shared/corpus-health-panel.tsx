'use client';

import type { CorpusHealthPanelProps } from '@props/trends/corpus-health-panel.props';
import type { TrendCorpusFreshnessProviderFailure } from '@props/trends/trends-page.props';
import Badge from '@ui/display/badge/Badge';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';

const PLATFORM_LABELS: Record<string, string> = {
  reddit: 'Reddit',
  tiktok: 'TikTok',
  twitter: 'X / Twitter',
};
const FAILURE_COPY: Record<
  TrendCorpusFreshnessProviderFailure['reason'],
  string
> = {
  empty_source_preview: 'No source previews were observed.',
  fallback_source_preview: 'Saved fallback previews are being used.',
  stale_source_preview: 'Saved source previews are stale.',
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
      aria-label="Source health"
      className="mb-4 space-y-3 rounded-lg border border-border p-4"
    >
      <div role="status" className="space-y-2">
        <Heading as="h2" size="sm">
          Source health
        </Heading>
        <Badge variant={variant}>
          {status ? `Trend corpus ${status}` : 'Checking trend corpus'}
        </Badge>
        <Text size="sm" color="subtle-60">
          {isUnavailable
            ? 'Source health could not be loaded. Previously loaded health may be outdated. Saved items remain available.'
            : 'Health describes saved source coverage. It does not confirm that a provider refresh succeeded.'}
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
                      ? 'Checking health'
                      : 'Health unavailable'}
                  </Text>
                  {health && !isUnavailable && segments.length === 0 ? (
                    <Text size="xs" color="subtle-60">
                      No saved health is available for this platform. Reload to
                      check again.
                    </Text>
                  ) : null}
                </div>
              ) : null}
              {segments.length === 0 ? (
                <Text size="xs" color="subtle-60">
                  Last observed source timestamp: Not recorded
                </Text>
              ) : null}
              {segments.map((segment) => (
                <div key={segment.id} className="space-y-1">
                  <Text size="sm">
                    {segment.provider}: {segment.status}
                  </Text>
                  <Text size="xs" color="subtle-60">
                    Last observed source timestamp:{' '}
                    {segment.latestSeenAt ?? 'Not recorded'}
                  </Text>
                </div>
              ))}
              {failures.map((failure) => (
                <div
                  key={`${failure.provider}:${failure.reason}`}
                  className="space-y-1"
                >
                  <Text size="sm">
                    {failure.provider}:{' '}
                    {FAILURE_COPY[failure.reason] ??
                      'Source preview health is unavailable.'}
                  </Text>
                  <Text size="xs" color="subtle-60">
                    Last preview observation:{' '}
                    {failure.latestObservedAt ?? 'Not recorded'}
                  </Text>
                </div>
              ))}
              <Text size="xs" color="subtle-60">
                Last successful refresh: Not recorded
              </Text>
              <Text size="xs" color="subtle-60">
                Last attempt: Not recorded
              </Text>
            </div>
          );
        })}
      </div>
    </section>
  );
}
