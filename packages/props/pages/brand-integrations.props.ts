import type { CredentialPlatform } from '@genfeedai/contracts';
import type { AccountHealthSummary } from '@genfeedai/contracts/interfaces';
import type { BrandDetailSocialConnection } from '@genfeedai/props/pages/brand-detail.props';
import type { ComponentType } from 'react';

export type AccountConnectionStatus = 'connected' | 'needsReconnect';

export type AccountAvatarSize = 'sm' | 'md';

export interface AccountAvatarProps {
  connection: BrandDetailSocialConnection;
  size?: AccountAvatarSize;
}

export interface AccountCellProps {
  connection: BrandDetailSocialConnection;
}

export interface AccountStatusBadgeProps {
  connection: BrandDetailSocialConnection;
  /**
   * Live health, fetched separately from the brand payload (see
   * `CredentialsService.listBrandAccountHealth`). Falls back to
   * `connection.accountHealth` when omitted; needs-reconnect still wins
   * over either source.
   */
  health?: AccountHealthSummary;
}

export interface AccountRowActionsMenuProps {
  connection: BrandDetailSocialConnection;
  isReconnectDisabled: boolean;
  onDisconnect: (connection: BrandDetailSocialConnection) => void;
  onPostingTimes: (connection: BrandDetailSocialConnection) => void;
  onReconnect: (connection: BrandDetailSocialConnection) => void;
}

export interface AccountsTableProps {
  /** Live health fetched for the brand, keyed by `credentialId` in each entry. */
  accountHealth: AccountHealthSummary[];
  connectingPlatform: string | null;
  connections: BrandDetailSocialConnection[];
  onConnectAccount: () => void;
  onDisconnect: (connection: BrandDetailSocialConnection) => void;
  onPostingTimes: (connection: BrandDetailSocialConnection) => void;
  onReconnect: (connection: BrandDetailSocialConnection) => void;
  /** Platforms whose OAuth connect route is not currently available (e.g. Threads readiness). */
  unavailablePlatforms: ReadonlySet<CredentialPlatform>;
}

/**
 * Readiness of a connect tile's OAuth route. Deliberately re-declared here
 * (rather than imported from `@ui/constants/oauth-connect-platforms`) —
 * `packages/ui` already depends on `packages/props` for component prop
 * types, so importing a `packages/ui` module back into a `packages/props`
 * file would form a package-level cycle even though this one import is
 * type-only and no single file cycle exists. The three literals are
 * structurally identical to `OAuthConnectReadiness`, so a real catalog
 * entry is assignable here without a cast.
 */
export type ConnectPlatformReadiness = 'available' | 'unavailable' | 'unknown';

/**
 * Structural counterpart of `ResolvedOAuthConnectPlatform` — see
 * `ConnectPlatformReadiness` for why this isn't imported directly.
 *
 * `category` is widened from `OAuthConnectPlatformCategoryId` to `string`
 * for the same reason: that type lives in `@ui/constants/oauth-connect-platforms`,
 * and importing it here would form the same `packages/props` -> `packages/ui`
 * cycle. The real catalog only ever produces its known category ids, so a
 * mistyped literal at a call site still fails structurally against
 * `ResolvedOAuthConnectPlatform` — just not as a type error at *this*
 * boundary. Moving the category-id union into `packages/contracts` would
 * close that gap but wasn't done here to avoid touching an unclaimed
 * package during this change.
 */
export interface ConnectAccountPlatform {
  category: string;
  connectId?: string;
  Icon: ComponentType<{ className?: string }>;
  iconClassName: string;
  isConnectAvailable: boolean;
  label: string;
  platform: CredentialPlatform;
  readiness: ConnectPlatformReadiness;
  servicePath?: string;
}

/**
 * Structural counterpart of `OAuthConnectPlatformGroup<ResolvedOAuthConnectPlatform>`.
 * `id` has the same `string`-widening trade-off as `category` above.
 */
export interface ConnectAccountPlatformGroup {
  description: string;
  id: string;
  label: string;
  platforms: ConnectAccountPlatform[];
}

export interface ConnectAccountModalProps {
  connectingPlatform: string | null;
  onConnect: (item: ConnectAccountPlatform) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  /** Live connected-account count per platform, shown as "N connected" per tile. */
  platformConnectedCounts: Partial<Record<CredentialPlatform, number>>;
  platformGroups: ConnectAccountPlatformGroup[];
}
