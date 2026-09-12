import { getCurrentSocialWarmupBlueprint } from '@genfeedai/contracts/api-types/contracts/social-warmup-blueprint.contract';
import type { AccountHealthSummary } from '@genfeedai/contracts/interfaces';
import type { BrandDetailSocialConnection } from '@genfeedai/props/pages/brand-detail.props';
import {
  type AccountConnectionStatusInput,
  getAccountConnectionStatus,
  isAccessTokenExpired,
} from '@ui/modals/brands/brand/ModalBrand.types';

export type { AccountConnectionStatusInput };
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
