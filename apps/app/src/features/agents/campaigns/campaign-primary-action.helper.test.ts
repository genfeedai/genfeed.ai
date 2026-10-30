import { describe, expect, it } from 'vitest';
import { getCampaignPrimaryActionKind } from '@/features/agents/campaigns/campaign-primary-action.helper';

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
