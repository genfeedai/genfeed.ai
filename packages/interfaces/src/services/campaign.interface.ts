/**
 * Ownership resolved from an outreach campaign's scalar FK columns, rather than
 * from the Mongo-era relation aliases that are `undefined` on a Prisma row.
 */
export interface ICampaignScope {
  brandId?: string;
  /** Nullable for campaigns created before credential ownership was required. */
  credentialId?: string;
  organizationId: string;
  userId?: string;
}
