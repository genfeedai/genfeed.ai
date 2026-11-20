import { formatPlatformLabel } from '@genfeedai/contracts';
import { formatAccountHandle } from '@genfeedai/helpers/publisher/connected-account.helper';
import type { ConnectedAccountData } from '@genfeedai/props/ui/display/connected-account.props';

interface ConnectedAccountText {
  /** What names the account on one line: its `@handle`, else its name. */
  primary: string;
  /** The account name, when it adds something beyond the handle. */
  name: string | null;
  handle: string | null;
  platformLabel: string;
}

export function getConnectedAccountText(
  account: ConnectedAccountData,
): ConnectedAccountText {
  const platformLabel =
    formatPlatformLabel(account.platform) ?? account.platform;
  const handle = formatAccountHandle(account.handle);
  const name = account.name?.trim() || null;

  return {
    handle,
    name: name && name !== handle ? name : null,
    platformLabel,
    primary: handle ?? name ?? platformLabel,
  };
}
