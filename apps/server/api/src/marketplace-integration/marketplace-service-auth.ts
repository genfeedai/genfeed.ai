/**
 * How the API proves itself to the marketplace. The marketplace checks the
 * same constants (apps/api/src/common/auth/service-auth.constants.ts in
 * genfeedai/marketplace.genfeed.ai): change them together.
 */
export const MARKETPLACE_SERVICE_AUDIENCE = 'marketplace-service';
export const MARKETPLACE_SERVICE_SUBJECT = 'genfeed-api';
/** The marketplace refuses a token that lives longer than five minutes. */
export const MARKETPLACE_SERVICE_TOKEN_SECONDS = 60;

export const MARKETPLACE_SERVICE_SCOPES = {
  recordPurchase: 'purchases:record',
  refundPurchase: 'purchases:refund',
} as const;

export type MarketplaceServiceScope =
  (typeof MARKETPLACE_SERVICE_SCOPES)[keyof typeof MARKETPLACE_SERVICE_SCOPES];
