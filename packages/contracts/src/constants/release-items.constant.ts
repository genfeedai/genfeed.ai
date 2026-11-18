/**
 * Work Genfeed releases to cloud organizations one item at a time: modules
 * and navigation destinations still being validated. Whether an item is
 * released is an operator decision stored in Admin → Flags as
 * `release_<id>`, never a code constant. An item without a stored release is
 * preview-only, so new work ships hidden until an operator releases it.
 *
 * A release only decides what the web app shows. The API and MCP admit work
 * in an unreleased item, so an agent can use every app.
 *
 * Playground, Storyboard and the Agent app are release items too. Hiding
 * them never shuts generation off: Playground carries every generation
 * endpoint, and the API admits that work whether or not the app is released.
 * The agent sidebar does not depend on the Agent app's release.
 */
export const RELEASE_ITEM_IDS = [
  'playground',
  'storyboard',
  'agent',
  'publishing',
  'analytics',
  'turbo',
  'motion',
  'clipper',
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
  /** Items a platform admin opened for this one organization. */
  releasedItemIds?: unknown;
}

/**
 * Whether the web app shows `itemId` to the organization: everything on
 * self-hosted, everything for a cloud organization on release preview, the
 * items an operator opened for that organization, and otherwise only what an
 * operator released for everyone. Unknown settings hide it.
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
  if (
    Array.isArray(audience.releasedItemIds) &&
    audience.releasedItemIds.includes(itemId)
  )
    return true;
  return flags[getReleaseFlagKey(itemId)] === true;
}
