'use client';

import type { AccountCellProps } from '@props/pages/brand-integrations.props';
import AccountAvatar from './AccountAvatar';
import { getConnectionLabel } from './account-connection-status.util';

/**
 * Account column content: avatar + platform badge, name, and `@handle`.
 * The handle only renders when the credential actually captured one — it
 * never falls back to the display name.
 */
export default function AccountCell({ connection }: AccountCellProps) {
  const label = getConnectionLabel(connection);

  return (
    <span className="flex min-w-0 items-center gap-3">
      <AccountAvatar connection={connection} />
      <span className="min-w-0 text-left">
        <span className="block truncate text-sm font-medium">{label}</span>
        {connection.handle ? (
          <span className="block truncate text-xs text-muted-foreground">
            @{connection.handle.replace(/^@/, '')}
          </span>
        ) : null}
      </span>
    </span>
  );
}
