'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { AccountHealthSummary } from '@genfeedai/contracts/interfaces';
import type { BrandDetailSocialConnection } from '@genfeedai/props/pages/brand-detail.props';
import type { AccountsTableProps } from '@props/pages/brand-integrations.props';
import Card from '@ui/card/Card';
import { EmptyState } from '@ui/card/EmptyState';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import { Button } from '@ui/primitives/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ui/primitives/table';
import { Link2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import AccountCell from './AccountCell';
import AccountRowActionsMenu from './AccountRowActionsMenu';
import AccountStatusBadge from './AccountStatusBadge';
import {
  getAccountConnectionStatus,
  getConnectionLabel,
} from './account-connection-status.util';

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
 * One row per account, all platforms — replaces the old per-platform card
 * grid. Desktop renders `@ui/primitives/table`; below `md` the same row
 * content collapses into stacked cards so nothing needs a horizontal scroll
 * on a phone.
 */
export default function AccountsTable({
  accountHealth,
  connectingPlatform,
  connections,
  onConnectAccount,
  onDisconnect,
  onPostingTimes,
  onReconnect,
  unavailablePlatforms,
}: AccountsTableProps) {
  const translate = useTranslations('pages.brandSocialMedia');
  const sortedConnections = useMemo(
    () => sortConnections(connections),
    [connections],
  );
  // The header count and each row's status must agree — both derive from
  // the same `getAccountConnectionStatus` call, not a separately computed
  // "isConnected" tally that a lapsed or identity-less row would inflate.
  const connectedCount = useMemo(
    () =>
      sortedConnections.filter(
        (connection) => getAccountConnectionStatus(connection) === 'connected',
      ).length,
    [sortedConnections],
  );
  const healthByCredentialId = useMemo(
    () => buildHealthByCredentialId(accountHealth),
    [accountHealth],
  );

  const connectButton = (
    <Button
      variant={ButtonVariant.DEFAULT}
      size={ButtonSize.SM}
      onClick={onConnectAccount}
    >
      {translate('connectAccount')}
    </Button>
  );

  return (
    <Card
      label={translate('connectedAccounts')}
      description={translate('accountsCount', {
        count: connectedCount,
      })}
      headerAction={connectButton}
    >
      {sortedConnections.length === 0 ? (
        <EmptyState
          title={translate('emptyAccountsTitle')}
          description={translate('emptyAccountsDescription')}
          icon={Link2}
          action={{
            label: translate('connectAccount'),
            onClick: onConnectAccount,
            variant: ButtonVariant.DEFAULT,
          }}
        />
      ) : (
        <>
          <div className="hidden md:block" data-testid="accounts-table-desktop">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{translate('accountsTableAccount')}</TableHead>
                  <TableHead>{translate('accountsTablePlatform')}</TableHead>
                  <TableHead>{translate('accountsTableStatus')}</TableHead>
                  <TableHead aria-label={translate('accountsTableActions')} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedConnections.map((connection) => {
                  // Only the row being reconnected is disabled — a connect
                  // in flight for one platform must not freeze every other
                  // account's Reconnect action.
                  const isReconnectDisabled =
                    unavailablePlatforms.has(connection.platform) ||
                    connectingPlatform === connection.platform;

                  return (
                    <TableRow key={connection.credentialId}>
                      <TableCell>
                        <AccountCell connection={connection} />
                      </TableCell>
                      <TableCell>
                        <PlatformBadge platform={connection.platform} />
                      </TableCell>
                      <TableCell>
                        <AccountStatusBadge
                          connection={connection}
                          health={healthByCredentialId.get(
                            connection.credentialId,
                          )}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <AccountRowActionsMenu
                          connection={connection}
                          isReconnectDisabled={isReconnectDisabled}
                          onDisconnect={onDisconnect}
                          onPostingTimes={onPostingTimes}
                          onReconnect={onReconnect}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div
            className="flex flex-col gap-2 md:hidden"
            data-testid="accounts-table-mobile"
          >
            {sortedConnections.map((connection) => {
              const isReconnectDisabled =
                unavailablePlatforms.has(connection.platform) ||
                connectingPlatform === connection.platform;

              return (
                <div
                  key={connection.credentialId}
                  className="flex flex-col gap-2 rounded-md bg-background px-3 py-2.5 shadow-border"
                >
                  <div className="flex items-center justify-between gap-2">
                    <AccountCell connection={connection} />
                    <AccountRowActionsMenu
                      connection={connection}
                      isReconnectDisabled={isReconnectDisabled}
                      onDisconnect={onDisconnect}
                      onPostingTimes={onPostingTimes}
                      onReconnect={onReconnect}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <PlatformBadge platform={connection.platform} />
                    <AccountStatusBadge
                      connection={connection}
                      health={healthByCredentialId.get(connection.credentialId)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
}
