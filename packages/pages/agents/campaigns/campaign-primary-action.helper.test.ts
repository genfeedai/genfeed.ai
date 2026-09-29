import { getCampaignPrimaryActionKind } from '@pages/agents/campaigns/campaign-primary-action.helper';
import { describe, expect, it } from 'vitest';

describe('getCampaignPrimaryActionKind', () => {
  it('starts a campaign that has never run', () => {
    expect(getCampaignPrimaryActionKind('draft')).toBe('start');
  });
});
