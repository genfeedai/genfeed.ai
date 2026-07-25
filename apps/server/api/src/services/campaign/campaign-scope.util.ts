import { type OutreachCampaignDocument } from '@api/collections/outreach-campaigns/schemas/outreach-campaign.schema';
import {
  requireRelationId,
  resolveRelationId,
} from '@api/shared/utils/relation-id/relation-id.util';
import type { ICampaignScope } from '@genfeedai/interfaces';

/**
 * Resolve an outreach campaign's ownership from its scalar FK columns.
 *
 * `OutreachCampaignsService.normalizeDoc` back-fills `organization` from
 * `organizationId`, but it sets neither `brand` nor `user` — so those Mongo-era
 * aliases are always `undefined` on a campaign row. Reading them left the
 * credential lookup without its brand filter (`normalizeWhere` strips undefined
 * values, so the query silently widened to the whole organization) and
 * attributed reply provenance to nobody.
 */
export function resolveCampaignScope(
  campaign: OutreachCampaignDocument,
): ICampaignScope {
  // `credential` is a config-JSON-backed field rather than a Prisma relation, so
  // there is no `credentialId` scalar to read. It still has to be guarded by
  // callers: an undefined `_id` is dropped by `normalizeWhere`, which would hand
  // back an arbitrary connected credential from the organization.
  // relation-alias-ok: config-backed field, guarded for presence by callers
  const credentialId = campaign.credential;

  return {
    brandId: resolveRelationId(campaign.brandId, campaign.brand),
    credentialId,
    organizationId: requireRelationId(
      campaign.organizationId,
      campaign.organization,
      'organization',
      `Campaign ${campaign.id}`,
    ),
    userId: resolveRelationId(campaign.userId, campaign.user),
  };
}
