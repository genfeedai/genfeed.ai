import { getCampaignPrimaryActionKind } from '@pages/agents/campaigns/campaign-primary-action.helper';
import { describe, expect, it } from 'vitest';

describe('getCampaignPrimaryActionKind', () => {
  it('resumes a paused campaign', () => {
    expect(getCampaignPrimaryActionKind('paused')).toBe('resume');
  });

  it('pauses a running campaign', () => {
    expect(getCampaignPrimaryActionKind('active')).toBe('pause');
  });

  it('starts a campaign that has never run', () => {
    expect(getCampaignPrimaryActionKind('draft')).toBe('start');
  });

  it('has no primary action once the campaign is completed', () => {
    expect(getCampaignPrimaryActionKind('completed')).toBeNull();
  });
});
