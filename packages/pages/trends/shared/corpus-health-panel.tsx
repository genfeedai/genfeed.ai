'use client';

import type {
  TrendRefreshHealth,
  TrendRefreshReason,
} from '@genfeedai/contracts/interfaces';
import { getPlatformIcon } from '@helpers/ui/platform-icon/platform-icon.helper';
import type { CorpusHealthPanelProps } from '@props/trends/corpus-health-panel.props';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';

const REASONS: Record<TrendRefreshReason, string> = {
  authentication_required:
    'Reconnect the account or repair the provider credentials.',
  access_required: 'The provider requires additional permission or API access.',
  budget_exhausted: 'Provider credits or the collection budget are exhausted.',
  rate_limited: 'The provider rate limit was reached. Retry later.',
  native_unavailable: 'No native provider is available for this dataset.',
  native_empty: 'The native provider returned no observations.',
  native_failed: 'The native provider request failed.',
  provider_failed: 'The collection provider request failed.',
  persistence_failed: 'Collection could not be saved. Retry the refresh.',
};

const PREVIEW_REASONS = {
  empty_source_preview: 'No source previews were observed.',
  fallback_source_preview: 'Source previews use fallback data.',
  stale_source_preview: 'Source previews are stale.',
  refresh_failed: 'Collection failed.',
};

function timestamp(value?: string | null): string {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`
    : 'Not recorded';
}

function receiptLabel(receipt: TrendRefreshHealth): string {
  if (receipt.outcome.endsWith('available')) return 'Available';
  if (receipt.outcome.endsWith('failed')) return 'Failed';
  return receipt.reason === 'native_unavailable' &&
    receipt.outcome === 'native_empty'
    ? 'Unsupported'
    : 'No observations';
}

export default function CorpusHealthPanel({
  health,
  isUnavailable = false,
  selectedPlatforms = [],
  scope = 'all',
}: CorpusHealthPanelProps) {
  const receipts =
    health?.refreshHealth?.filter(
      (receipt) =>
        (scope === 'all' || receipt.scope === scope) &&
        (!selectedPlatforms.length ||
          selectedPlatforms.includes(receipt.platform)),
    ) ?? [];
  const platforms = selectedPlatforms.length
    ? [...selectedPlatforms]
    : [
        ...new Set([
          ...receipts.map((receipt) => receipt.platform),
          ...(health?.summary.platforms ?? []),
        ]),
      ];
  const failures = receipts.filter((receipt) =>
    receipt.outcome.endsWith('failed'),
  );
  return (
    <section aria-label="Source health" className="mb-4">
      <Card
        label="Source health"
        bodyClassName="space-y-3"
        headerAction={
          <Badge
            variant={
              isUnavailable || failures.length
                ? 'warning'
                : receipts.some((receipt) =>
                      receipt.outcome.endsWith('available'),
                    )
                  ? 'success'
                  : 'ghost'
            }
          >
            {isUnavailable
              ? 'Unavailable'
              : !health
                ? 'Checking collection'
                : failures.length
                  ? `${failures.length} collection failures`
                  : receipts.length
                    ? 'Collection recorded'
                    : 'No collection recorded'}
          </Badge>
        }
      >
        <div className="flex flex-wrap gap-2">
          {platforms.map((platform) => {
            const rows = receipts.filter(
              (receipt) => receipt.platform === platform,
            );
            const failed = rows.some((receipt) =>
              receipt.outcome.endsWith('failed'),
            );
            const available = rows.some((receipt) =>
              receipt.outcome.endsWith('available'),
            );
            return (
              <Badge
                key={platform}
                variant={failed ? 'warning' : available ? 'success' : 'ghost'}
              >
                {getPlatformIcon(platform, 'size-3')}
                <span className="ml-1">
                  {platform === 'twitter' ? 'X' : platform} ·{' '}
                  {failed
                    ? 'degraded'
                    : available
                      ? 'available'
                      : rows.length
                        ? 'no observations'
                        : 'not recorded'}
                </span>
              </Badge>
            );
          })}
        </div>
        {isUnavailable ? (
          <p className="text-xs text-muted-foreground">
            Collection health could not be loaded. Reload to retry.
          </p>
        ) : null}
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground">
            Collection details ·{' '}
            {scope === 'global'
              ? 'public market'
              : 'public market and connected accounts'}
          </summary>
          <ul className="mt-3 divide-y divide-border">
            {receipts.map((receipt) => (
              <li
                key={`${receipt.platform}:${receipt.dataset}:${receipt.scope}`}
                className="space-y-1 py-3"
              >
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span>
                    {receipt.platform} · {receipt.dataset} ·{' '}
                    {receipt.scope === 'global'
                      ? 'Public market'
                      : 'Connected account'}{' '}
                    ·{' '}
                    {receipt.outcome.startsWith('fallback')
                      ? 'Apify fallback'
                      : 'Native provider'}
                  </span>
                  <Badge
                    variant={
                      receipt.outcome.endsWith('failed')
                        ? 'warning'
                        : receipt.outcome.endsWith('available')
                          ? 'success'
                          : 'ghost'
                    }
                  >
                    {receiptLabel(receipt)}
                  </Badge>
                </div>
                {receipt.reason && !receipt.outcome.endsWith('available') ? (
                  <p className="text-xs text-muted-foreground">
                    {REASONS[receipt.reason]}
                  </p>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  Last attempt {timestamp(receipt.lastAttemptAt)} · Last
                  successful refresh{' '}
                  {timestamp(receipt.lastSuccessfulRefreshAt)}
                </p>
              </li>
            ))}
          </ul>
          {!receipts.length ? (
            <p className="py-3 text-xs text-muted-foreground">
              No saved collection attempts for this scope.
            </p>
          ) : null}
        </details>
        {health?.providerFailures.some(
          (failure) => failure.reason !== 'refresh_failed',
        ) ? (
          <details>
            <summary className="cursor-pointer text-xs text-muted-foreground">
              Source preview coverage
            </summary>
            <ul className="mt-2 space-y-2">
              {health.providerFailures
                .filter(
                  (failure) =>
                    failure.reason !== 'refresh_failed' &&
                    (!selectedPlatforms.length ||
                      selectedPlatforms.includes(failure.platform)),
                )
                .map((failure) => (
                  <li
                    key={`${failure.platform}:${failure.provider}:${failure.reason}`}
                    className="text-xs text-muted-foreground"
                  >
                    {failure.platform} · {failure.provider}:{' '}
                    {PREVIEW_REASONS[failure.reason]} ·{' '}
                    {timestamp(failure.latestObservedAt)}
                  </li>
                ))}
            </ul>
          </details>
        ) : null}
      </Card>
    </section>
  );
}
