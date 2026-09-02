import type { ContentCampaignStatus } from '@genfeedai/enums';
import type { ICampaign } from '@genfeedai/interfaces';
import type { Campaign } from '@genfeedai/prisma';

/**
 * Persistence row → product contract. `status` is a String column carrying the
 * lowercase {@link ContentCampaignStatus} product vocabulary, and the date
 * columns cross the API boundary as ISO strings.
 */
export function toCampaign(row: Campaign): ICampaign {
  return {
    brandId: row.brandId,
    brief: row.brief,
    createdAt: row.createdAt.toISOString(),
    endDate: row.endDate?.toISOString() ?? null,
    id: row.id,
    isDeleted: row.isDeleted,
    name: row.name,
    objective: row.objective,
    organizationId: row.organizationId,
    startDate: row.startDate?.toISOString() ?? null,
    status: row.status as ContentCampaignStatus,
    updatedAt: row.updatedAt.toISOString(),
    userId: row.userId,
  };
}
