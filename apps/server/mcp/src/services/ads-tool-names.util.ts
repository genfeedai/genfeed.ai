export const isMetaAdsTool = (name: string): boolean =>
  name.startsWith('list_meta_') ||
  name.startsWith('get_meta_') ||
  name.startsWith('compare_meta_');

export const isGoogleAdsTool = (name: string): boolean =>
  name.startsWith('list_google_ads_') || name.startsWith('get_google_ads_');

export const isTikTokAdsTool = (name: string): boolean =>
  name.startsWith('list_tiktok_') || name.startsWith('get_tiktok_');

/**
 * Platform-generic ads gateway tools (`/ads/:platform/*`). The `get_ads_` prefix
 * is reserved for this executor — per-platform tools use their own platform
 * prefix (`get_meta_`, `get_google_ads_`), so the namespaces cannot overlap.
 */
export const isAdsGatewayTool = (name: string): boolean =>
  name.startsWith('get_ads_');
