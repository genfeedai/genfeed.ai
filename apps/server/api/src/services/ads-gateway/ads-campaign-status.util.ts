import type { AdsPlatform } from '@genfeedai/interfaces';

/**
 * The only campaign status this product writes to a paid-media provider.
 * Creating or updating a campaign may never activate spend, so the unified
 * contract accepts the exact string `PAUSED` or an omitted status — nothing
 * else, in any casing.
 */
export const UNIFIED_PAUSED_CAMPAIGN_STATUS = 'PAUSED';

/**
 * Each provider spells "paused" differently. TikTok has no PAUSED operation
 * status; its campaign write API takes `DISABLE`.
 */
const PROVIDER_PAUSED_CAMPAIGN_STATUS: Record<AdsPlatform, string> = {
  google: 'PAUSED',
  meta: 'PAUSED',
  tiktok: 'DISABLE',
  x: 'PAUSED',
};

export const INVALID_CAMPAIGN_STATUS_MESSAGE = `Campaign status must be omitted or the exact string "${UNIFIED_PAUSED_CAMPAIGN_STATUS}". Activating a paid-media campaign is not supported.`;

/**
 * Framework-neutral so the gateway controller and every adapter share one
 * contract without dragging NestJS into shared code. Callers own the HTTP
 * translation and throw their own 4xx.
 */
export function isPausedCampaignStatus(
  status: unknown,
): status is typeof UNIFIED_PAUSED_CAMPAIGN_STATUS {
  return status === UNIFIED_PAUSED_CAMPAIGN_STATUS;
}

/**
 * An omitted status is valid intent — it means "whatever paused looks like on
 * this provider". Anything present that is not exactly `PAUSED` is rejected.
 */
export function isAcceptedCampaignStatus(status: unknown): boolean {
  return status === undefined || isPausedCampaignStatus(status);
}

export function resolveProviderPausedStatus(platform: AdsPlatform): string {
  return PROVIDER_PAUSED_CAMPAIGN_STATUS[platform];
}

/**
 * Update semantics: an omitted status stays omitted so the provider never
 * receives a status mutation, while a supplied `PAUSED` maps to the provider's
 * paused value.
 */
export function resolveProviderCampaignStatus(
  platform: AdsPlatform,
  status: unknown,
): string | undefined {
  return status === undefined
    ? undefined
    : resolveProviderPausedStatus(platform);
}
