import type { ToolDataSource } from '../../interfaces/tool-definition.interface';

/**
 * Reads that call a third party and bill per call (credits or a platform
 * fee). They keep the cost confirmation and are the only `fetch_*` tools.
 */
export const PROVIDER_PAID_TOOLS: ReadonlySet<string> = new Set([
  'fetch_instagram_inspiration',
  'fetch_instagram_inspiration_detail',
  'fetch_x_account_activity',
  'fetch_x_posts',
]);

/**
 * Reads that call a live third party (ad platforms, the ad library, the
 * embedding provider) with no per-call cost to the caller. Read-only, but
 * open-world. Everything not listed here or above reads our own database.
 */
export const PROVIDER_FREE_TOOLS: ReadonlySet<string> = new Set([
  'compare_meta_campaigns',
  'get_ad_research_detail',
  'get_ads_ad_insights',
  'get_ads_adset_insights',
  'get_ads_research',
  'get_google_ads_adgroup_insights',
  'get_google_ads_campaign_metrics',
  'get_google_ads_campaigns',
  'get_google_ads_customers',
  'get_google_ads_keyword_performance',
  'get_google_ads_search_terms',
  'get_meta_ad_accounts',
  'get_meta_ad_creatives',
  'get_meta_ad_insights',
  'get_meta_adset_insights',
  'get_meta_campaign_insights',
  'get_meta_campaigns',
  'get_meta_top_performers',
  'get_tiktok_ad_accounts',
  'get_tiktok_adgroups',
  'get_tiktok_ads',
  'get_tiktok_campaign_insights',
  'get_tiktok_campaigns',
  'get_tiktok_top_performers',
  'search_knowledge',
]);

export function toolDataSource(name: string): ToolDataSource {
  if (PROVIDER_PAID_TOOLS.has(name)) return 'provider-paid';
  if (PROVIDER_FREE_TOOLS.has(name)) return 'provider';
  return 'stored';
}
