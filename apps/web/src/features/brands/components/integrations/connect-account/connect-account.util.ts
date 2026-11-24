import type { BrandDetailSocialConnection } from '@props/pages/brand-detail.props';
import type {
  ConnectAccountPlatform,
  ConnectAccountPlatformGroup,
} from '@props/pages/brand-integrations.props';

export type ConnectTileStatus = 'connecting' | 'connected' | 'idle';

export function getConnectTileStatus(
  item: ConnectAccountPlatform,
  connections: BrandDetailSocialConnection[],
  connectingPlatform: string | null,
): ConnectTileStatus {
  if (connectingPlatform === item.platform) {
    return 'connecting';
  }
  return connections.length > 0 ? 'connected' : 'idle';
}

export function getConnectKey(item: ConnectAccountPlatform): string {
  return item.connectId ?? item.platform;
}

/** Case-insensitive match on the label or platform id; blank query keeps all. */
export function filterConnectGroups(
  groups: ConnectAccountPlatformGroup[],
  query: string,
): ConnectAccountPlatformGroup[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return groups;
  }

  return groups
    .map((group) => ({
      ...group,
      platforms: group.platforms.filter(
        (item) =>
          item.label.toLowerCase().includes(needle) ||
          item.platform.toLowerCase().includes(needle),
      ),
    }))
    .filter((group) => group.platforms.length > 0);
}
