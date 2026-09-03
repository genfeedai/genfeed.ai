import {
  ContentCampaignStatus,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { campaignDispatchAllowedFilter } from '@workers/services/campaign-dispatch.filter';
import { describe, expect, it } from 'vitest';

describe('campaignDispatchAllowedFilter', () => {
  it('lets unassigned posts through and blocks paused campaign dispatch', () => {
    expect(campaignDispatchAllowedFilter()).toEqual({
      OR: [
        { campaignId: null },
        { targetExecutionState: TargetExecutionState.PUBLISHING },
        {
          campaign: {
            isDeleted: false,
            status: {
              notIn: [
                ContentCampaignStatus.ARCHIVED,
                ContentCampaignStatus.COMPLETED,
                ContentCampaignStatus.PAUSED,
              ],
            },
          },
        },
      ],
    });
  });
});
