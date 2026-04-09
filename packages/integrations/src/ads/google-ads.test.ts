import {
  normalizeGoogleAdsCampaign,
  normalizeGoogleAdsCampaignMetricsRecord,
  normalizeGoogleAdsCustomer,
} from './google-ads';

describe('google ads mappers', () => {
  it('normalizes customers into ad accounts', () => {
    expect(
      normalizeGoogleAdsCustomer({
        currencyCode: 'USD',
        descriptiveName: 'North America',
        id: '123-456-7890',
        isManager: false,
        timeZone: 'America/New_York',
      }),
    ).toEqual({
      currency: 'USD',
      externalAccountId: '123-456-7890',
      name: 'North America',
      platform: 'google-ads',
      status: 'active',
      timezone: 'America/New_York',
    });
  });

  it('normalizes campaigns', () => {
    expect(
      normalizeGoogleAdsCampaign(
        {
          advertisingChannelType: 'SEARCH',
          budgetAmountMicros: '25000000',
          endDate: '2025-01-31',
          id: '123',
          name: 'Search Campaign',
          startDate: '2025-01-01',
          status: 'ENABLED',
        },
        '456',
      ),
    ).toMatchObject({
      budgetAmountMicros: '25000000',
      channelType: 'SEARCH',
      endDate: '2025-01-31',
      externalAccountId: '456',
      externalCampaignId: '123',
      name: 'Search Campaign',
      platform: 'google-ads',
      startDate: '2025-01-01',
      status: 'ENABLED',
    });
  });

  it('normalizes campaign metrics into performance records', () => {
    expect(
      normalizeGoogleAdsCampaignMetricsRecord({
        currency: 'USD',
        externalAccountId: '456',
        metrics: {
          averageCpc: 2.5,
          averageCpm: 12.5,
          campaignId: '123',
          campaignName: 'Search Campaign',
          clicks: 40,
          conversions: 5,
          conversionsValue: 300,
          costMicros: 100000000,
          ctr: 4,
          date: '2025-01-01',
          impressions: 1000,
        },
      }),
    ).toMatchObject({
      campaignName: 'Search Campaign',
      clicks: 40,
      conversions: 5,
      cpa: 20,
      cpc: 2.5,
      cpm: 12.5,
      ctr: 4,
      currency: 'USD',
      dataConfidence: 1,
      date: '2025-01-01',
      externalAccountId: '456',
      externalCampaignId: '123',
      granularity: 'campaign',
      impressions: 1000,
      platform: 'google-ads',
      revenue: 300,
      roas: 3,
      spend: 100,
    });
  });
});
