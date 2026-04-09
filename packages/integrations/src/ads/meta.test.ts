import {
  computeAdDataConfidence,
  extractMetaRevenue,
  normalizeMetaAdAccount,
  normalizeMetaCampaign,
  normalizeMetaCampaignInsightRecord,
} from './meta';

describe('meta ads mappers', () => {
  it('normalizes ad accounts', () => {
    expect(
      normalizeMetaAdAccount({
        accountId: '123456',
        currency: 'EUR',
        id: 'act_123456',
        name: 'Main Account',
        status: 1,
        timezone: 'Europe/Malta',
      }),
    ).toEqual({
      currency: 'EUR',
      externalAccountId: 'act_123456',
      name: 'Main Account',
      platform: 'meta',
      status: 1,
      timezone: 'Europe/Malta',
    });
  });

  it('normalizes campaigns', () => {
    expect(
      normalizeMetaCampaign(
        {
          dailyBudget: 100,
          id: 'cmp_123',
          name: 'Campaign',
          objective: 'OUTCOME_SALES',
          startTime: '2025-01-01',
          status: 'ACTIVE',
          stopTime: '2025-01-31',
        },
        'act_1',
      ),
    ).toMatchObject({
      dailyBudget: 100,
      endDate: '2025-01-31',
      externalAccountId: 'act_1',
      externalCampaignId: 'cmp_123',
      name: 'Campaign',
      objective: 'OUTCOME_SALES',
      platform: 'meta',
      startDate: '2025-01-01',
      status: 'ACTIVE',
    });
  });

  it('extracts revenue from purchase action values', () => {
    expect(
      extractMetaRevenue([
        { actionType: 'link_click', value: '12' },
        { actionType: 'purchase', value: '245.5' },
      ]),
    ).toBe(245.5);
  });

  it('normalizes campaign insight records', () => {
    expect(
      normalizeMetaCampaignInsightRecord({
        campaign: {
          id: 'cmp_123',
          name: 'Campaign',
          objective: 'OUTCOME_SALES',
          status: 'ACTIVE',
        },
        currency: 'USD',
        externalAccountId: 'act_123',
        insight: {
          actionValues: [{ actionType: 'purchase', value: '200' }],
          clicks: 20,
          conversions: 4,
          costPerResult: 25,
          cpc: 5,
          cpm: 50,
          ctr: 2,
          dateStart: '2025-01-01',
          impressions: 1000,
          spend: 100,
        },
      }),
    ).toMatchObject({
      campaignName: 'Campaign',
      campaignObjective: 'OUTCOME_SALES',
      campaignStatus: 'ACTIVE',
      clicks: 20,
      conversions: 4,
      cpa: 25,
      cpc: 5,
      cpm: 50,
      ctr: 2,
      currency: 'USD',
      dataConfidence: 1,
      date: '2025-01-01',
      externalAccountId: 'act_123',
      externalCampaignId: 'cmp_123',
      granularity: 'campaign',
      impressions: 1000,
      platform: 'meta',
      revenue: 200,
      roas: 2,
      spend: 100,
    });
  });

  it('computes fallback confidence when only conversions exist', () => {
    expect(computeAdDataConfidence({ conversions: 3 })).toBe(0.7);
    expect(computeAdDataConfidence({})).toBe(0.5);
  });
});
