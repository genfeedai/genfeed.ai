'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { getPlatformIcon } from '@genfeedai/helpers/ui/platform-icon/platform-icon.helper';
import type { BrandDetailConnectedAccountsSectionProps } from '@props/pages/brand-detail.props';
import Card from '@ui/card/Card';
import CollectionSection from '@ui/collection/CollectionSection';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { EmptyState } from '@ui/primitives/empty-state';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  getAccountConnectionStatus,
  getConnectionLabel,
} from '@/features/brands/components/integrations/account-connection-status.util';

/**
 * Connected accounts for a brand: one row per account with its platform icon
 * and status. The title and Manage sit above the card like every other
 * section; connecting and reconnecting live on /settings/accounts.
 */
export default function BrandDetailConnectedAccountsSection({
  connections,
  manageHref,
}: BrandDetailConnectedAccountsSectionProps) {
  const t = useTranslations('pages.brandLinks');

  return (
    <CollectionSection
      actions={
        <Button asChild size={ButtonSize.XS} variant={ButtonVariant.SECONDARY}>
          <Link href={manageHref}>{t('manageAccounts')}</Link>
        </Button>
      }
      title={t('connectedAccountsTitle')}
    >
      {connections.length === 0 ? (
        <EmptyState title={t('noConnectedAccounts')} />
      ) : (
        <Card>
          <ul className="flex flex-col divide-y divide-border">
            {connections.map((connection) => {
              const label = getConnectionLabel(connection);
              const isConnected =
                getAccountConnectionStatus(connection) === 'connected';

              return (
                <li
                  className="flex items-center gap-3 py-2 first:pt-0 last:pb-0"
                  key={connection.credentialId}
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-tertiary">
                    {getPlatformIcon(connection.platform, 'size-3.5')}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {label}
                  </span>
                  <Badge variant={isConnected ? 'success' : 'warning'}>
                    {isConnected
                      ? t('accountConnected')
                      : t('accountNeedsReconnect')}
                  </Badge>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </CollectionSection>
  );
}
