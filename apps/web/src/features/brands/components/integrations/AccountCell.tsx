'use client';

import type { AccountCellProps } from '@props/pages/brand-integrations.props';
import ConnectedAccount from '@ui/display/connected-account/ConnectedAccount';
import { toConnectionAccount } from './account-connection-status.util';

/**
 * Account column content: the shared connected-account display, with the
 * avatar and platform badge, the name, and `@handle`.
 */
export default function AccountCell({ connection }: AccountCellProps) {
  return (
    <ConnectedAccount
      account={toConnectionAccount(connection)}
      layout="stacked"
      size="md"
    />
  );
}
