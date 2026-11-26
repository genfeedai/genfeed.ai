'use client';
import {
  ButtonSize,
  ButtonVariant,
  CredentialPlatform,
  formatPlatformLabel,
} from '@genfeedai/contracts';
import type { AccountHealthSummary } from '@genfeedai/contracts/interfaces';
import type { BrandDetailSocialConnection } from '@genfeedai/props/pages/brand-detail.props';
import type { AccountsTableProps } from '@props/pages/brand-integrations.props';
import type { TableAction, TableColumn } from '@props/ui/display/table.props';

import { createSummaryRowSidebar } from '@ui/display/table/summary-row-sidebar';
import AppTable from '@ui/display/table/Table';
import { Button } from '@ui/primitives/button';
import {
  Link2,
  MessageSquareWarning,
  Plus,
  Radio,
  RefreshCw,
  Settings,
  TriangleAlert,
  Unlink,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import DirectMessageReconnectNotice from '@/features/messages/components/DirectMessageReconnectNotice';
import AccountCell from './AccountCell';
import AccountStatusBadge from './AccountStatusBadge';
import AccountStatusIcons from './AccountStatusIcons';
import {
  getAccountConnectionStatus,
  getConnectionLabel,
  getReconnectReason,
  needsDirectMessageReconnect,
  RECONNECT_REASON_MESSAGE_KEYS,
} from './account-connection-status.util';

const LEADING_AT_SIGN_PATTERN = /^@/;

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
  onGoLive,
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
        // Icon-only, so the header is read by screen readers only. It sits at
        // the row's right end with the same 8px inset as the hover actions
        // (`px-2`), so the icons and the actions that replace them on hover
        // line up.
        className: 'w-px whitespace-nowrap pr-2',
        header: (
          <span className="sr-only">{translate('accountsTableStatus')}</span>
        ),
        key: 'status',
        render: (connection) => (
          <AccountStatusIcons
            connection={connection}
            health={healthByCredentialId.get(connection.credentialId)}
          />
        ),
        sortable: false,
      },
    ],
    [healthByCredentialId, translate],
  );

  const actions = useMemo<TableAction<BrandDetailSocialConnection>[]>(
    () => [
      {
        // The DM warning is only shown on hover (the status icons are
        // replaced by the row actions), so it is an action of its own: the
        // explanation is its tooltip and clicking it reconnects.
        icon: (
          <MessageSquareWarning aria-hidden="true" className="text-warning" />
        ),
        isDisabled: (connection) =>
          unavailablePlatforms.has(connection.platform) ||
          reconnectingCredentialId === connection.credentialId,
        ariaLabel: translate('dmReconnectBadge'),
        isVisible: needsDirectMessageReconnect,
        onClick: onReconnect,
        tooltip: translate('dmReconnectHint'),
      },
      {
        // An account that needs reconnecting shows the warning here, with the
        // cause in the tooltip, so its detail stays readable on hover. Spins
        // while that row's reconnect is starting, so the click reads as
        // working until the browser leaves for the provider.
        icon: (connection) =>
          reconnectingCredentialId === connection.credentialId ? (
            // ui-guard-allow:loading-spinner -- reconnect icon rotates while the reconnect starts, not a loading placeholder
            <RefreshCw aria-hidden="true" className="animate-spin" />
          ) : getAccountConnectionStatus(connection) === 'needsReconnect' ? (
            <TriangleAlert aria-hidden="true" className="text-warning" />
          ) : (
            <RefreshCw aria-hidden="true" />
          ),
        // Only the row being reconnected is disabled — keyed by
        // credentialId, not platform, so reconnecting one account doesn't
        // freeze Reconnect for a sibling account on the same platform. A
        // brand-new connect (no credential yet) is tracked separately, by
        // ConnectAccountModal's own connectingPlatform.
        isDisabled: (connection) =>
          unavailablePlatforms.has(connection.platform) ||
          reconnectingCredentialId === connection.credentialId,
        ariaLabel: translate('reconnect'),
        onClick: onReconnect,
        tooltip: (connection) => {
          const reason = getReconnectReason(connection);
          return reason
            ? translate(RECONNECT_REASON_MESSAGE_KEYS[reason])
            : translate('reconnect');
        },
      },
      {
        // Live video needs `publish_video`, which only a Facebook Page
        // connection requests. The dialog explains a refused grant.
        icon: <Radio aria-hidden="true" />,
        isVisible: (connection) =>
          connection.platform === CredentialPlatform.FACEBOOK &&
          getAccountConnectionStatus(connection) !== 'needsReconnect',
        onClick: onGoLive,
        tooltip: translate('goLive'),
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
      onGoLive,
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
          <div className="flex flex-wrap items-center gap-1.5">
            <AccountStatusBadge
              connection={connection}
              health={healthByCredentialId.get(connection.credentialId)}
            />
          </div>
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
            ? `@${connection.handle.replace(LEADING_AT_SIGN_PATTERN, '')}`
            : undefined,
        getTitle: getConnectionLabel,
        kind: 'account',
        renderExtra: (connection) => (
          <div className="flex flex-col gap-3">
            {needsDirectMessageReconnect(connection) ? (
              <DirectMessageReconnectNotice
                accounts={[
                  {
                    credentialId: connection.credentialId,
                    label: getConnectionLabel(connection),
                  },
                ]}
                isDisabled={unavailablePlatforms.has(connection.platform)}
                onReconnect={() => onReconnect(connection)}
                reconnectingCredentialId={reconnectingCredentialId}
              />
            ) : null}
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
      empty={{
        action: {
          icon: Plus,
          label: translate('connectAccount'),
          onClick: onConnectAccount,
        },
        description: translate('emptyAccountsDescription'),
        icon: Link2,
        title: translate('emptyAccountsTitle'),
      }}
      getRowKey={(connection) => connection.credentialId}
      items={sortedConnections}
      rowSidebar={rowSidebar}
    />
  );
}
