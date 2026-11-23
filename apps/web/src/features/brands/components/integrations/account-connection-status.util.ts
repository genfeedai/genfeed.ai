import {
  CredentialPlatform,
  formatPlatformLabel,
  SocialSourcePlatform,
} from '@genfeedai/contracts';
import { getCurrentSocialWarmupBlueprint } from '@genfeedai/contracts/api-types/contracts/social-warmup-blueprint.contract';
import type { AccountHealthSummary } from '@genfeedai/contracts/interfaces';
import type { BrandDetailSocialConnection } from '@genfeedai/props/pages/brand-detail.props';
import type { ConnectedAccountData } from '@genfeedai/props/ui/display/connected-account.props';
import {
  getAccountConnectionStatus,
  isAccessTokenExpired,
} from '@ui/modals/brands/brand/ModalBrand.types';

// Re-exported from ModalBrand.types.ts, where the derivation actually
// lives: `packages/hooks` needs the same status logic as this pages-layer
// package (for use-brand-detail.ts's connectedPlatformsCount), and reaches
// `packages/ui` via the same alias it already used for
// `buildSocialConnections` — so the pure functions live there instead of
// here. Every existing pages-layer import of this file keeps working
// unchanged.
export { getAccountConnectionStatus, isAccessTokenExpired };

/** Maps every `AccountHealthSummary['state']` to its translation key — the
 * `satisfies` check keeps this exhaustive if the union ever grows. */
export const STATE_MESSAGE_KEYS = {
  healthy: 'state.healthy',
  not_started: 'state.notStarted',
  risky: 'state.risky',
  warming: 'state.warming',
} as const satisfies Record<AccountHealthSummary['state'], string>;

/** Why an account needs reconnecting, as a `reconnectReason.*` message key. */
export type ReconnectReason = 'disconnected' | 'expired' | 'noIdentity';

export const RECONNECT_REASON_MESSAGE_KEYS = {
  disconnected: 'reconnectReason.disconnected',
  expired: 'reconnectReason.expired',
  noIdentity: 'reconnectReason.noIdentity',
} as const satisfies Record<ReconnectReason, string>;

/**
 * Names the first thing wrong with an account that needs reconnecting, in the
 * same order `getAccountConnectionStatus` checks them. `undefined` for an
 * account that is connected.
 */
export function getReconnectReason(
  connection: Pick<
    BrandDetailSocialConnection,
    'accessTokenExpiry' | 'externalId' | 'isConnected'
  >,
): ReconnectReason | undefined {
  if (!connection.externalId) {
    return 'noIdentity';
  }
  if (connection.isConnected === false) {
    return 'disconnected';
  }
  if (isAccessTokenExpired(connection.accessTokenExpiry)) {
    return 'expired';
  }
  return undefined;
}

const HISTORY_IMPORT_PLATFORMS = new Set<string>(
  Object.values(SocialSourcePlatform),
);

/** Platforms whose existing posts can be imported after they connect. */
export function hasHistoryImport(
  platform: BrandDetailSocialConnection['platform'],
): boolean {
  return HISTORY_IMPORT_PLATFORMS.has(platform);
}

export function hasWarmupBlueprint(
  platform: BrandDetailSocialConnection['platform'],
): boolean {
  return Boolean(getCurrentSocialWarmupBlueprint(platform));
}

/** A brand's social connection as the shared connected-account display takes it. */
export function toConnectionAccount(
  connection: BrandDetailSocialConnection,
): ConnectedAccountData {
  return {
    avatarUrl: connection.avatarUrl,
    handle: connection.handle,
    name: connection.name || connection.label,
    platform: connection.platform,
  };
}

export function getConnectionLabel(
  connection: BrandDetailSocialConnection,
): string {
  const label =
    connection.name ||
    connection.label ||
    connection.handle ||
    connection.platform;
  return label === connection.platform
    ? (formatPlatformLabel(connection.platform) ?? label)
    : label;
}

/**
 * True for an X account whose stored grant was captured without DM access.
 * Grants from before scope capture stay quiet: their DM access is unknown
 * until a sync or a reconnect.
 */
export function needsDirectMessageReconnect(
  connection: Pick<
    BrandDetailSocialConnection,
    'directMessageCapability' | 'platform'
  >,
): boolean {
  return (
    connection.platform === CredentialPlatform.TWITTER &&
    connection.directMessageCapability === 'reconnect'
  );
}
