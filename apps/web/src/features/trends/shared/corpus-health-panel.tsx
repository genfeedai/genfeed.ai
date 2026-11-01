'use client';

import { ComponentSize } from '@genfeedai/contracts';
import type { TrendRefreshHealth } from '@genfeedai/contracts/interfaces';
import { getPlatformIcon } from '@helpers/ui/platform-icon/platform-icon.helper';
import Card from '@ui/card/Card';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import { Badge } from '@ui/primitives/badge';
import { useTranslations } from 'next-intl';
import type { CorpusHealthPanelProps } from '@/features/trends/props/corpus-health-panel.props';

function timestamp(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`
    : fallback;
}

function receiptLabel(receipt: TrendRefreshHealth): string {
  if (receipt.outcome.endsWith('available')) return 'availableTitle';
  if (receipt.outcome.endsWith('failed')) return 'failedTitle';
  return receipt.reason === 'native_unavailable' &&
    receipt.outcome === 'native_empty'
    ? 'unsupportedTitle'
    : 'noObservationsTitle';
}

export default function CorpusHealthPanel({
  health,
  isUnavailable = false,
  selectedPlatforms = [],
  scope = 'all',
}: CorpusHealthPanelProps) {
  const translate = useTranslations('ui.discovery');
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
  const previewFailures =
    health?.providerFailures.filter(
      (failure) =>
        failure.reason !== 'refresh_failed' &&
        (!selectedPlatforms.length ||
          selectedPlatforms.includes(failure.platform)),
    ) ?? [];
  const failures = receipts.filter((receipt) =>
    receipt.outcome.endsWith('failed'),
  );
  return (
    <section aria-label={translate('health')} className="mb-4">
      <Card
        label={translate('health')}
        headerAction={
          <Badge
            variant={
              isUnavailable || failures.length
                ? 'warning'
                : receipts.some((receipt) =>
                      receipt.outcome.endsWith('available'),
                    )
                  ? 'success'
                  : 'secondary'
            }
          >
            {isUnavailable
              ? translate('unavailable')
              : !health
                ? translate('checking')
                : failures.length
                  ? translate('failures', { count: failures.length })
                  : receipts.length
                    ? translate('collectionRecorded')
                    : translate('noCollection')}
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
                variant={
                  failed ? 'warning' : available ? 'success' : 'secondary'
                }
              >
                {getPlatformIcon(platform, 'size-3')}
                <span className="ml-1">
                  {platform === 'twitter' ? 'X' : platform} ·{' '}
                  {failed
                    ? translate('degraded')
                    : available
                      ? translate('available')
                      : rows.length
                        ? translate('noObservations')
                        : translate('notRecorded')}
                </span>
              </Badge>
            );
          })}
        </div>
        {isUnavailable ? (
          <p className="text-xs text-muted-foreground">
            {translate('healthError')}
          </p>
        ) : null}
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground">
            {translate('collectionDetails')} ·{' '}
            {scope === 'global'
              ? translate('publicMarket')
              : translate('allScopes')}
          </summary>
          <ul className="mt-3 divide-y divide-border">
            {receipts.map((receipt) => (
              <li
                key={`${receipt.platform}:${receipt.dataset}:${receipt.scope}`}
                className="space-y-1 py-3"
              >
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <PlatformBadge
                    platform={receipt.platform}
                    size={ComponentSize.SM}
                  />
                  <span>
                    {receipt.dataset} ·{' '}
                    {receipt.scope === 'global'
                      ? translate('publicMarketTitle')
                      : translate('connectedAccount')}{' '}
                    ·{' '}
                    {receipt.outcome.startsWith('fallback')
                      ? translate('fallbackProvider')
                      : translate('nativeProvider')}
                  </span>
                  <Badge
                    variant={
                      receipt.outcome.endsWith('failed')
                        ? 'warning'
                        : receipt.outcome.endsWith('available')
                          ? 'success'
                          : 'secondary'
                    }
                  >
                    {translate(receiptLabel(receipt))}
                  </Badge>
                </div>
                {receipt.reason && !receipt.outcome.endsWith('available') ? (
                  <p className="text-xs text-muted-foreground">
                    {translate(`reasons.${receipt.reason}`)}
                  </p>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  {translate('lastAttempt')}{' '}
                  {timestamp(receipt.lastAttemptAt, translate('notRecorded'))} ·{' '}
                  {translate('lastSuccess')}{' '}
                  {timestamp(
                    receipt.lastSuccessfulRefreshAt,
                    translate('notRecorded'),
                  )}
                </p>
              </li>
            ))}
          </ul>
          {!receipts.length ? (
            <p className="py-3 text-xs text-muted-foreground">
              {translate('noAttempts')}
            </p>
          ) : null}
        </details>
        {previewFailures.length ? (
          <details>
            <summary className="cursor-pointer text-xs text-muted-foreground">
              {translate('previewCoverage')}
            </summary>
            <ul className="mt-2 space-y-2">
              {previewFailures.map((failure) => (
                <li
                  key={`${failure.platform}:${failure.provider}:${failure.reason}`}
                  className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground"
                >
                  <PlatformBadge
                    platform={failure.platform}
                    size={ComponentSize.SM}
                  />
                  {failure.provider}:{' '}
                  {translate(`previewReasons.${failure.reason}`)} ·{' '}
                  {timestamp(
                    failure.latestObservedAt,
                    translate('notRecorded'),
                  )}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </Card>
    </section>
  );
}
