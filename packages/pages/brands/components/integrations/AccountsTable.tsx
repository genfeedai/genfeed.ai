'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
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

/**
 * One row per account, all platforms — replaces the old per-platform card
 * grid. Desktop renders `@ui/primitives/table`; below `md` the same row
 * content collapses into stacked cards so nothing needs a horizontal scroll
 * on a phone.
 */
export default function AccountsTable({
  connectedPlatformsCount,
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
        count: connectedPlatformsCount,
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
          <div className="hidden md:block">
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
                  const isReconnectDisabled =
                    unavailablePlatforms.has(connection.platform) ||
                    connectingPlatform !== null;

                  return (
                    <TableRow key={connection.credentialId}>
                      <TableCell>
                        <AccountCell connection={connection} />
                      </TableCell>
                      <TableCell>
                        <PlatformBadge platform={connection.platform} />
                      </TableCell>
                      <TableCell>
                        <AccountStatusBadge connection={connection} />
                      </TableCell>
                      <TableCell className="text-right">
                        <AccountRowActionsMenu
                          connection={connection}
                          isPostingTimesDisabled={false}
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

          <div className="flex flex-col gap-2 md:hidden">
            {sortedConnections.map((connection) => {
              const isReconnectDisabled =
                unavailablePlatforms.has(connection.platform) ||
                connectingPlatform !== null;

              return (
                <div
                  key={connection.credentialId}
                  className="flex flex-col gap-2 rounded-md bg-background px-3 py-2.5 shadow-border"
                >
                  <div className="flex items-center justify-between gap-2">
                    <AccountCell connection={connection} />
                    <AccountRowActionsMenu
                      connection={connection}
                      isPostingTimesDisabled={false}
                      isReconnectDisabled={isReconnectDisabled}
                      onDisconnect={onDisconnect}
                      onPostingTimes={onPostingTimes}
                      onReconnect={onReconnect}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <PlatformBadge platform={connection.platform} />
                    <AccountStatusBadge connection={connection} />
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
