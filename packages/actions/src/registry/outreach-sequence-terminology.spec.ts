import { describe, expect, it } from 'vitest';
import { getToolByName } from './tool-registry';

const OUTREACH_SEQUENCE_ACTIONS = [
  'complete_outreach_sequence',
  'create_outreach_sequence',
  'get_outreach_sequence_analytics',
  'pause_outreach_sequence',
  'start_outreach_sequence',
] as const;

const BANNED_GENERIC_CAMPAIGN_ACTIONS = [
  'complete_campaign',
  'create_campaign',
  'get_campaign_analytics',
  'pause_campaign',
  'start_campaign',
] as const;

const PROVIDER_ADS_CAMPAIGN_ACTIONS = [
  'compare_meta_campaigns',
  'get_google_ads_campaign_metrics',
  'get_meta_campaign_insights',
  'get_tiktok_campaign_insights',
  'list_google_ads_campaigns',
  'list_meta_campaigns',
  'list_tiktok_campaigns',
] as const;

describe('outreach sequence terminology', () => {
  it('registers outreach-sequence actions and rejects generic Campaign actions', () => {
    for (const name of OUTREACH_SEQUENCE_ACTIONS) {
      expect(getToolByName(name)?.name, name).toBe(name);
    }

    for (const name of BANNED_GENERIC_CAMPAIGN_ACTIONS) {
      expect(getToolByName(name), name).toBeUndefined();
    }
  });

  it('renders outreach-sequence actions as outreach-sequence cards', () => {
    expect(getToolByName('create_outreach_sequence')?.uiActionType).toBe(
      'outreach_sequence_create_card',
    );
    expect(getToolByName('start_outreach_sequence')?.uiActionType).toBe(
      'outreach_sequence_control_card',
    );
    expect(getToolByName('pause_outreach_sequence')?.uiActionType).toBe(
      'outreach_sequence_control_card',
    );
    expect(getToolByName('complete_outreach_sequence')?.uiActionType).toBe(
      'outreach_sequence_control_card',
    );
  });

  it('keeps provider Ads campaign action names', () => {
    for (const name of PROVIDER_ADS_CAMPAIGN_ACTIONS) {
      expect(getToolByName(name)?.name, name).toBe(name);
    }
  });

  it('describes outreach-sequence tools without generic Campaign wording', () => {
    for (const name of OUTREACH_SEQUENCE_ACTIONS) {
      const description = getToolByName(name)?.description ?? '';
      expect(description.toLowerCase(), name).toContain('outreach sequence');
      expect(description.toLowerCase(), name).not.toMatch(/\bcampaigns?\b/);
    }
  });
});
