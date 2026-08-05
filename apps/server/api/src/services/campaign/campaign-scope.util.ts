import { type OutreachCampaignDocument } from '@api/collections/outreach-campaigns/schemas/outreach-campaign.schema';
import { requireRelationId } from '@api/shared/utils/relation-id/relation-id.util';
import type { ICampaignScope } from '@genfeedai/interfaces';

/**
 * Resolve an outreach campaign's ownership from its scalar FK columns.
 *
 * The schema owns brand, credential, organization, and user scalar foreign keys.
 */
export function resolveCampaignScope(
  campaign: OutreachCampaignDocument,
): ICampaignScope {
  return {
    brandId: campaign.brandId ?? undefined,
    credentialId: campaign.credentialId ?? undefined,
    organizationId: requireRelationId(
      campaign.organizationId,
      'organizationId',
      `Campaign ${campaign.id}`,
    ),
    userId: campaign.userId ?? undefined,
  };
}
