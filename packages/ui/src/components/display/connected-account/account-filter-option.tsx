import type { ConnectedAccountData } from '@genfeedai/props/ui/display/connected-account.props';
import type { FilterMenuOption } from '@genfeedai/props/ui/forms/filter-menu.props';
import ConnectedAccountAvatar from '@ui/display/connected-account/ConnectedAccountAvatar';
import { getConnectedAccountText } from '@ui/display/connected-account/connected-account.util';

/**
 * One account in a Filters menu: its avatar, then its handle exactly as
 * written. Every account facet builds its options through this, so an account
 * looks the same in every menu.
 */
export function accountFilterOption(
  account: ConnectedAccountData,
  value: string,
  extras: Pick<FilterMenuOption, 'count'> = {},
): FilterMenuOption {
  return {
    ...extras,
    icon: <ConnectedAccountAvatar account={account} isDecorative size="xs" />,
    isLiteral: true,
    label: getConnectedAccountText(account).primary,
    value,
  };
}
