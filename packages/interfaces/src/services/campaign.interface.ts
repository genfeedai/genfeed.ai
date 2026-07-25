/**
 * Ownership resolved from an outreach campaign's scalar FK columns, rather than
 * from the Mongo-era relation aliases that are `undefined` on a Prisma row.
 */
export interface ICampaignScope {
  brandId?: string;
  /** Config-JSON-backed field on the campaign; callers must guard presence. */
  credentialId?: string;
  organizationId: string;
  userId?: string;
}
