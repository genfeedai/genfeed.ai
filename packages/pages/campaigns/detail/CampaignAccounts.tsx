'use client';

import { ButtonVariant, formatPlatformLabel } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useCampaignAccounts } from '@hooks/data/campaigns/use-campaign-accounts';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { CampaignAccountsProps } from '@props/content/campaign-setup.props';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

export default function CampaignAccounts({ brandId }: CampaignAccountsProps) {
  const t = useTranslations('pages.publishing.campaigns');
  const { href } = useOrgUrl();
  const { accounts, eligibleAccounts, isPending, isError, refetch } =
    useCampaignAccounts(brandId);
  return (
    <Card label={t('accounts.title')}>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">{t('accounts.description')}</p>
        {isPending ? (
          <p role="status">{t('accounts.loading')}</p>
        ) : isError ? (
          <div role="alert">
            <p>{t('accounts.failed')}</p>
            <Button
              variant={ButtonVariant.SECONDARY}
              onClick={() => void refetch()}
            >
              {t('accounts.retry')}
            </Button>
          </div>
        ) : accounts.length ? (
          <ul className="flex flex-col gap-2">
            {accounts.map((account) => (
              <li
                key={account.id}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <span>
                  {formatPlatformLabel(account.platform)} ·{' '}
                  {account.externalHandle ||
                    account.externalName ||
                    account.label ||
                    t('accounts.unnamed')}
                </span>
                <span className="text-muted">
                  {t(
                    eligibleAccounts.some((item) => item.id === account.id)
                      ? 'accounts.available'
                      : 'accounts.unsupported',
                  )}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm">{t('accounts.empty')}</p>
        )}
        <Button asChild variant={ButtonVariant.SECONDARY}>
          <Link href={href(APP_ROUTES.SETTINGS.INTEGRATIONS)}>
            {t('accounts.manage')}
          </Link>
        </Button>
      </div>
    </Card>
  );
}
