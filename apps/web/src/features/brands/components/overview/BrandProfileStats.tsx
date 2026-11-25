'use client';

import { formatCompactNumberIntl } from '@genfeedai/helpers/formatting/format/format.helper';
import { MetricSummary } from '@ui/cards/metric-card/MetricCard';
import ConnectedAccountAvatar from '@ui/display/connected-account/ConnectedAccountAvatar';
import { useTranslations } from 'next-intl';
import type { BrandProfileStatsProps } from '@/features/brands/props/brand-profile-stats.props';

/**
 * The line under the profile header: what the creator's posts have reached
 * (the same views, impressions and engagements the public profile shows) and
 * the connected accounts as avatars. A metric with no data is left out and a
 * profile with nothing to show renders nothing, never a row of zeros.
 */
export default function BrandProfileStats({
  accounts,
  reach,
}: BrandProfileStatsProps) {
  const t = useTranslations('pages.brandDetailOverview');

  const items = [
    { label: t('viewsLabel'), value: reach?.views },
    { label: t('impressionsLabel'), value: reach?.impressions },
    { label: t('engagementsLabel'), value: reach?.engagements },
  ].flatMap(({ label, value }) =>
    value && value > 0
      ? [{ label, value: formatCompactNumberIntl(value) }]
      : [],
  );
  const connectedAccounts = accounts.filter(
    (account) => account.isConnected !== false,
  );

  if (items.length === 0 && connectedAccounts.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3">
      {items.length > 0 ? <MetricSummary items={items} /> : <span />}
      {connectedAccounts.length > 0 ? (
        <ul
          aria-label={t('connectedAccountsPreview')}
          className="flex items-center gap-3"
        >
          {connectedAccounts.map((account) => (
            <li key={account.credentialId}>
              <ConnectedAccountAvatar
                account={{
                  avatarUrl: account.avatarUrl,
                  handle: account.handle,
                  name: account.name,
                  platform: account.platform,
                }}
                isDecorative
                size="md"
              />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
