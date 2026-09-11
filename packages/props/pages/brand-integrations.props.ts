import type { CredentialPlatform } from '@genfeedai/contracts';
import type { BrandDetailSocialConnection } from '@genfeedai/props/pages/brand-detail.props';
import type {
  OAuthConnectPlatformGroup,
  ResolvedOAuthConnectPlatform,
} from '@ui/constants/oauth-connect-platforms';

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
}

export interface AccountRowActionsMenuProps {
  connection: BrandDetailSocialConnection;
  isPostingTimesDisabled: boolean;
  isReconnectDisabled: boolean;
  onDisconnect: (connection: BrandDetailSocialConnection) => void;
  onPostingTimes: (connection: BrandDetailSocialConnection) => void;
  onReconnect: (connection: BrandDetailSocialConnection) => void;
}

export interface AccountsTableProps {
  connectedPlatformsCount: number;
  connectingPlatform: string | null;
  connections: BrandDetailSocialConnection[];
  onConnectAccount: () => void;
  onDisconnect: (connection: BrandDetailSocialConnection) => void;
  onPostingTimes: (connection: BrandDetailSocialConnection) => void;
  onReconnect: (connection: BrandDetailSocialConnection) => void;
  /** Platforms whose OAuth connect route is not currently available (e.g. Threads readiness). */
  unavailablePlatforms: ReadonlySet<CredentialPlatform>;
}

export interface ConnectAccountModalProps {
  connectingPlatform: string | null;
  onConnect: (item: ResolvedOAuthConnectPlatform) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  /** Live connected-account count per platform, shown as "N connected" per tile. */
  platformConnectedCounts: Partial<Record<CredentialPlatform, number>>;
  platformGroups: OAuthConnectPlatformGroup<ResolvedOAuthConnectPlatform>[];
}
