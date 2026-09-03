import {
  ContentCampaignItemKind,
  type ContentCampaignItemOutcomeStatus,
  ContentCampaignStatus,
  canApplyContentCampaignLifecycle,
  type TargetExecutionState,
} from '@genfeedai/contracts';
import type {
  ICampaign,
  ICampaignLifecycleItemOutcome,
} from '@genfeedai/contracts/interfaces';
import type { Campaign } from '@genfeedai/prisma';

export { canApplyContentCampaignLifecycle };

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

export function campaignItemOutcome(input: {
  executionState?: TargetExecutionState;
  id: string;
  kind?: ContentCampaignItemKind;
  reason?: string;
  retryable?: boolean;
  status: ContentCampaignItemOutcomeStatus;
}): ICampaignLifecycleItemOutcome {
  return {
    ...(input.executionState ? { executionState: input.executionState } : {}),
    id: input.id,
    kind: input.kind ?? ContentCampaignItemKind.POST,
    ...(input.reason ? { reason: input.reason } : {}),
    retryable: input.retryable ?? false,
    status: input.status,
  };
}
