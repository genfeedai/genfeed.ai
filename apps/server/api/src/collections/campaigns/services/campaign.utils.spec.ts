import {
  campaignItemOutcome,
  canApplyContentCampaignLifecycle,
} from '@api/collections/campaigns/services/campaign.utils';
import {
  ContentCampaignItemOutcomeStatus,
  ContentCampaignLifecycleAction,
  ContentCampaignStatus,
} from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';

describe('campaign.utils lifecycle helpers', () => {
  it('blocks start, pause, complete, and generate on archived campaigns', () => {
    expect(
      canApplyContentCampaignLifecycle(
        ContentCampaignStatus.ARCHIVED,
        ContentCampaignLifecycleAction.START,
      ),
    ).toBe(false);
    expect(
      canApplyContentCampaignLifecycle(
        ContentCampaignStatus.ARCHIVED,
        ContentCampaignLifecycleAction.ASSIGN,
      ),
    ).toBe(true);
  });

  it('builds retryable item outcomes without dropping independent fields', () => {
    expect(
      campaignItemOutcome({
        id: 'cpost00000001',
        reason: 'Review is not approved',
        retryable: true,
        status: ContentCampaignItemOutcomeStatus.INELIGIBLE,
      }),
    ).toEqual({
      id: 'cpost00000001',
      kind: 'post',
      reason: 'Review is not approved',
      retryable: true,
      status: ContentCampaignItemOutcomeStatus.INELIGIBLE,
    });
  });
});
