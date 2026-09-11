import { getCurrentSocialWarmupBlueprint } from '@genfeedai/contracts/api-types/contracts/social-warmup-blueprint.contract';
import type { AccountHealthSummary } from '@genfeedai/contracts/interfaces';
import type { BrandDetailSocialConnection } from '@genfeedai/props/pages/brand-detail.props';
import type { AccountConnectionStatus } from '@genfeedai/props/pages/brand-integrations.props';

/** Maps every `AccountHealthSummary['state']` to its translation key — the
 * `satisfies` check keeps this exhaustive if the union ever grows. */
export const STATE_MESSAGE_KEYS = {
  healthy: 'state.healthy',
  not_started: 'state.notStarted',
  risky: 'state.risky',
  warming: 'state.warming',
} as const satisfies Record<AccountHealthSummary['state'], string>;

export function hasWarmupBlueprint(
  platform: BrandDetailSocialConnection['platform'],
): boolean {
  return Boolean(getCurrentSocialWarmupBlueprint(platform));
}

export function getConnectionLabel(
  connection: BrandDetailSocialConnection,
): string {
  return (
    connection.name ||
    connection.label ||
    connection.handle ||
    connection.platform
  );
}

export function getConnectionInitials(
  connection: BrandDetailSocialConnection,
): string {
  const label = getConnectionLabel(connection).trim();
  const initials = label
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return initials || connection.platform.slice(0, 2).toUpperCase();
}

/** `accessTokenExpiry` is unset for platforms that never rotate a token. */
export function isAccessTokenExpired(
  accessTokenExpiry?: string | null,
): boolean {
  if (!accessTokenExpiry) {
    return false;
  }

  const expiry = new Date(accessTokenExpiry).getTime();
  return Number.isFinite(expiry) && expiry <= Date.now();
}

/**
 * A row needs reconnecting when it never captured a platform identity
 * (`externalId`) — including a still-`isConnected` row whose OAuth flow
 * finished without one, e.g. a legacy broken connection — when it has an
 * identity but is no longer connected (a lapsed connection), or when its
 * access token has expired. `isConnected` defaults to connected when
 * omitted so legacy callers that only ever built connected rows keep
 * behaving the same way.
 *
 * A row with neither an identity nor a connection (pending or abandoned
 * OAuth — the credential exists only because the flow never finished) does
 * not reach this function at all: `buildSocialConnections` hides it before
 * status is ever derived. See `isVisibleCredentialRow`.
 */
export function getAccountConnectionStatus(
  connection: BrandDetailSocialConnection,
): AccountConnectionStatus {
  if (!connection.externalId) {
    return 'needsReconnect';
  }

  if (connection.isConnected === false) {
    return 'needsReconnect';
  }

  if (isAccessTokenExpired(connection.accessTokenExpiry)) {
    return 'needsReconnect';
  }

  return 'connected';
}
