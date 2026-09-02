import {
  CONTENT_CAMPAIGN_DISPATCH_BLOCKED_STATUSES,
  TargetExecutionState,
} from '@genfeedai/enums';
import type { Prisma } from '@genfeedai/prisma';

/**
 * Future Campaign-directed dispatch is blocked when the program is paused,
 * completed, or archived. In-flight provider-accepted publishes still finish.
 */
export function campaignDispatchAllowedFilter(): Prisma.PostWhereInput {
  return {
    OR: [
      { campaignId: null },
      { targetExecutionState: TargetExecutionState.PUBLISHING },
      {
        campaign: {
          isDeleted: false,
          status: {
            notIn: [...CONTENT_CAMPAIGN_DISPATCH_BLOCKED_STATUSES],
          },
        },
      },
    ],
  };
}
