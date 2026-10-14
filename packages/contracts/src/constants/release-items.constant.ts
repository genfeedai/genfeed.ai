/**
 * Work Genfeed releases to cloud organizations one item at a time: modules
 * and navigation destinations still being validated. Whether an item is
 * released is an operator decision stored in Admin → Flags as
 * `release_<id>`, never a code constant. An item without a stored release is
 * preview-only, so new work ships hidden until an operator releases it.
 *
 * Playground and Storyboard are not release items: Playground admits every
 * generation (including MCP), so it can never be unreleased by accident.
 */
export const RELEASE_ITEM_IDS = [
  'publishing',
  'analytics',
  'turbo',
  'motion',
  'clips',
  'editor',
  'automation',
  'messages',
  'discovery',
  'campaigns',
  'analytics_brands',
  'analytics_streaks',
  'analytics_insights',
  'analytics_hooks',
  'analytics_outliers',
  'analytics_breakouts',
  'analytics_performance_lab',
] as const;

export type ReleaseItemId = (typeof RELEASE_ITEM_IDS)[number];
export type PlatformReleaseFlagKey = `release_${ReleaseItemId}`;

export const PLATFORM_RELEASE_FLAG_KEYS: readonly PlatformReleaseFlagKey[] =
  RELEASE_ITEM_IDS.map((itemId) => getReleaseFlagKey(itemId));

const RELEASE_ITEM_ID_SET = new Set<string>(RELEASE_ITEM_IDS);

export function isReleaseItemId(value: unknown): value is ReleaseItemId {
  return typeof value === 'string' && RELEASE_ITEM_ID_SET.has(value);
}

export function getReleaseFlagKey(
  itemId: ReleaseItemId,
): PlatformReleaseFlagKey {
  return `release_${itemId}`;
}

/** Organization settings that decide whether unreleased work is visible. */
export interface ReleaseAudienceInput {
  hasOrganizationBilling?: unknown;
  /** Platform-admin release preview for one cloud organization. */
  isReleasePreviewEnabled?: unknown;
}

/**
 * Whether the organization may see and start work in `itemId`: everything on
 * self-hosted, everything for a cloud organization on release preview, and
 * otherwise only what an operator released. Unknown settings hide it.
 */
export function isReleaseItemVisible(
  itemId: string,
  audience: ReleaseAudienceInput | null | undefined,
  flags: Readonly<Record<string, unknown>>,
): boolean {
  if (typeof audience?.hasOrganizationBilling !== 'boolean') return false;
  if (!isReleaseItemId(itemId)) return true;
  if (!audience.hasOrganizationBilling) return true;
  if (audience.isReleasePreviewEnabled === true) return true;
  return flags[getReleaseFlagKey(itemId)] === true;
}
