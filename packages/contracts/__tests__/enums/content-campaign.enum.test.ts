import { describe, expect, it } from 'vitest';
import {
  ContentCampaignLifecycleAction,
  ContentCampaignStatus,
  canApplyContentCampaignLifecycle,
} from '../../src/enums/content-campaign.enum';

describe('content-campaign lifecycle helpers', () => {
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
});
