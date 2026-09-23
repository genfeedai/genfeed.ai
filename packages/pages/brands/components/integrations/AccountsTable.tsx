'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type { AccountHealthSummary } from '@genfeedai/contracts/interfaces';
import type { BrandDetailSocialConnection } from '@genfeedai/props/pages/brand-detail.props';
import type { AccountsTableProps } from '@props/pages/brand-integrations.props';
import type { TableColumn } from '@props/ui/display/table.props';
import { CardEmptyContent } from '@ui/card/empty/CardEmpty';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import AppTable from '@ui/display/table/Table';
import { Button } from '@ui/primitives/button';
import { Link2, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import AccountCell from './AccountCell';
import AccountRowActionsMenu from './AccountRowActionsMenu';
import AccountStatusBadge from './AccountStatusBadge';
import { getConnectionLabel } from './account-connection-status.util';

function sortConnections(
  connections: BrandDetailSocialConnection[],
): BrandDetailSocialConnection[] {
  return [...connections].sort((left, right) => {
    const platformCompare = left.platform.localeCompare(right.platform);
    if (platformCompare !== 0) {
      return platformCompare;
    }
    return getConnectionLabel(left).localeCompare(getConnectionLabel(right));
  });
}

function buildHealthByCredentialId(
  accountHealth: AccountHealthSummary[],
): Map<string, AccountHealthSummary> {
  return new Map(
    accountHealth.map((summary) => [summary.credentialId, summary]),
  );
}

/**
 * One row per account, all platforms, on the shared settings table (same
 * frame as Knowledge, Skills and Characters). The page header owns the
 * Connect account trigger; the empty state repeats it so an empty brand
 * still has an in-content call to action. The Platform column drops below
 * `md` — the account avatar already carries the platform glyph — so the
 * table fits a phone without a horizontal scroll.
 */
export default function AccountsTable({
  accountHealth,
  connections,
  onConnectAccount,
  onDisconnect,
  onPostingTimes,
  onReconnect,
  reconnectingCredentialId,
  unavailablePlatforms,
}: AccountsTableProps) {
  const translate = useTranslations('pages.brandSocialMedia');
  const sortedConnections = useMemo(
    () => sortConnections(connections),
    [connections],
  );
  const healthByCredentialId = useMemo(
    () => buildHealthByCredentialId(accountHealth),
    [accountHealth],
  );

  const columns = useMemo<TableColumn<BrandDetailSocialConnection>[]>(
    () => [
      {
        header: translate('accountsTableAccount'),
        key: 'account',
        render: (connection) => <AccountCell connection={connection} />,
      },
      {
        className: 'hidden md:table-cell',
        header: translate('accountsTablePlatform'),
        key: 'platform',
        render: (connection) => (
          <PlatformBadge platform={connection.platform} />
        ),
      },
      {
        header: translate('accountsTableStatus'),
        key: 'status',
        render: (connection) => (
          <AccountStatusBadge
            connection={connection}
            health={healthByCredentialId.get(connection.credentialId)}
          />
        ),
      },
      {
        className: 'w-12 text-right',
        header: (
          <span className="sr-only">{translate('accountsTableActions')}</span>
        ),
        key: 'actions',
        // Only the row being reconnected is disabled — keyed by
        // credentialId, not platform, so reconnecting one account doesn't
        // freeze Reconnect for a sibling account on the same platform. A
        // brand-new connect (no credential yet) is tracked separately, by
        // ConnectAccountModal's own connectingPlatform.
        render: (connection) => (
          <AccountRowActionsMenu
            connection={connection}
            isReconnectDisabled={
              unavailablePlatforms.has(connection.platform) ||
              reconnectingCredentialId === connection.credentialId
            }
            onDisconnect={onDisconnect}
            onPostingTimes={onPostingTimes}
            onReconnect={onReconnect}
          />
        ),
      },
    ],
    [
      healthByCredentialId,
      onDisconnect,
      onPostingTimes,
      onReconnect,
      reconnectingCredentialId,
      translate,
      unavailablePlatforms,
    ],
  );

  return (
    <AppTable<BrandDetailSocialConnection>
      ariaLabel={translate('connectedAccounts')}
      columns={columns}
      emptyState={
        <CardEmptyContent
          actions={
            <Button
              onClick={onConnectAccount}
              variant={ButtonVariant.DEFAULT}
              withWrapper={false}
            >
              <Plus /> {translate('connectAccount')}
            </Button>
          }
          description={translate('emptyAccountsDescription')}
          icon={Link2}
          label={translate('emptyAccountsTitle')}
        />
      }
      getRowKey={(connection) => connection.credentialId}
      items={sortedConnections}
    />
  );
}
