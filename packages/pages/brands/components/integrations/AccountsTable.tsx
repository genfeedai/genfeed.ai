'use client';

import {
  ButtonSize,
  ButtonVariant,
  formatPlatformLabel,
} from '@genfeedai/contracts';
import type { AccountHealthSummary } from '@genfeedai/contracts/interfaces';
import type { BrandDetailSocialConnection } from '@genfeedai/props/pages/brand-detail.props';
import type { AccountsTableProps } from '@props/pages/brand-integrations.props';
import type { TableAction, TableColumn } from '@props/ui/display/table.props';
import { CardEmptyContent } from '@ui/card/empty/CardEmpty';
import { createSummaryRowSidebar } from '@ui/display/table/summary-row-sidebar';
import AppTable from '@ui/display/table/Table';
import { Button } from '@ui/primitives/button';
import { Link2, Plus, RefreshCw, Settings, Unlink } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import AccountCell from './AccountCell';
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
 * still has an in-content call to action. The account avatar owns the
 * platform glyph across all viewport sizes.
 */
export default function AccountsTable({
  accountHealth,
  connections,
  onConnectAccount,
  onDisconnect,
  onOpenSettings,
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
        header: translate('accountsTableStatus'),
        key: 'status',
        render: (connection) => (
          <AccountStatusBadge
            connection={connection}
            health={healthByCredentialId.get(connection.credentialId)}
          />
        ),
      },
    ],
    [healthByCredentialId, translate],
  );

  const actions = useMemo<TableAction<BrandDetailSocialConnection>[]>(
    () => [
      {
        icon: <RefreshCw aria-hidden="true" />,
        // Only the row being reconnected is disabled — keyed by
        // credentialId, not platform, so reconnecting one account doesn't
        // freeze Reconnect for a sibling account on the same platform. A
        // brand-new connect (no credential yet) is tracked separately, by
        // ConnectAccountModal's own connectingPlatform.
        isDisabled: (connection) =>
          unavailablePlatforms.has(connection.platform) ||
          reconnectingCredentialId === connection.credentialId,
        onClick: onReconnect,
        tooltip: translate('reconnect'),
      },
      {
        icon: <Settings aria-hidden="true" />,
        onClick: onOpenSettings,
        tooltip: translate('settings'),
      },
      {
        className: 'text-destructive hover:text-destructive',
        icon: <Unlink aria-hidden="true" />,
        onClick: onDisconnect,
        tooltip: translate('disconnect'),
      },
    ],
    [
      onDisconnect,
      onOpenSettings,
      onReconnect,
      reconnectingCredentialId,
      translate,
      unavailablePlatforms,
    ],
  );

  const rowSidebar = useMemo(
    () =>
      createSummaryRowSidebar<BrandDetailSocialConnection>({
        getBadges: (connection) => (
          <AccountStatusBadge
            connection={connection}
            health={healthByCredentialId.get(connection.credentialId)}
          />
        ),
        getFacts: (connection) => [
          {
            id: 'platform',
            label: translate('accountsTablePlatform'),
            value: formatPlatformLabel(connection.platform),
          },
        ],
        getId: (connection) => connection.credentialId,
        getSubtitle: (connection) =>
          connection.handle
            ? `@${connection.handle.replace(/^@/, '')}`
            : undefined,
        getTitle: getConnectionLabel,
        kind: 'account',
        renderExtra: (connection) => (
          <div className="flex flex-wrap gap-2">
            <Button
              icon={<RefreshCw aria-hidden="true" className="size-3.5" />}
              isDisabled={
                unavailablePlatforms.has(connection.platform) ||
                reconnectingCredentialId === connection.credentialId
              }
              label={translate('reconnect')}
              onClick={() => onReconnect(connection)}
              size={ButtonSize.SM}
              variant={ButtonVariant.SECONDARY}
            />
            <Button
              icon={<Settings aria-hidden="true" className="size-3.5" />}
              label={translate('settings')}
              onClick={() => onOpenSettings(connection)}
              size={ButtonSize.SM}
              variant={ButtonVariant.SECONDARY}
            />
            <Button
              icon={<Unlink aria-hidden="true" className="size-3.5" />}
              label={translate('disconnect')}
              onClick={() => onDisconnect(connection)}
              size={ButtonSize.SM}
              variant={ButtonVariant.DESTRUCTIVE}
            />
          </div>
        ),
      }),
    [
      healthByCredentialId,
      onDisconnect,
      onOpenSettings,
      onReconnect,
      reconnectingCredentialId,
      translate,
      unavailablePlatforms,
    ],
  );

  return (
    <AppTable<BrandDetailSocialConnection>
      actions={actions}
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
      rowSidebar={rowSidebar}
    />
  );
}
