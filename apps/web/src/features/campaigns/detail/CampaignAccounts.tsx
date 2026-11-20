'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { toConnectedAccount } from '@helpers/publisher/connected-account.helper';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import Card from '@ui/card/Card';
import ConnectedAccount from '@ui/display/connected-account/ConnectedAccount';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useCampaignAccounts } from '@/features/campaigns/hooks/use-campaign-accounts';
import type { CampaignAccountsProps } from '@/features/campaigns/props/campaign-setup.props';

export default function CampaignAccounts({ brandId }: CampaignAccountsProps) {
  const t = useTranslations('pages.publishing.campaigns');
  const { activeHref } = useOrgUrl();
  const { accounts, eligibleAccounts, isPending, isError, refetch } =
    useCampaignAccounts(brandId);
  return (
    <Card label={t('accounts.title')}>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          {t('accounts.description')}
        </p>
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
                <ConnectedAccount
                  account={toConnectedAccount(account)}
                  size="sm"
                />
                <span className="text-muted-foreground">
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
          <Link href={activeHref(APP_ROUTES.SETTINGS.PROFILE)}>
            {t('accounts.manage')}
          </Link>
        </Button>
      </div>
    </Card>
  );
}
