const HYPHENS_PATTERN = /-/g;

/** Google Ads REST paths and headers take the customer id without dashes. */
export function normalizeGoogleAdsCustomerId(customerId: string): string {
  return customerId.replace(HYPHENS_PATTERN, '');
}
