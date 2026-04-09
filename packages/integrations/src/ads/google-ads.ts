import type {
  GoogleAdsCampaignInput,
  GoogleAdsCampaignMetricsInput,
  GoogleAdsCustomerInput,
  NormalizedAdAccount,
  NormalizedAdCampaign,
  NormalizedAdPerformanceRecord,
} from './types';

function microsToCurrency(value: number): number {
  return value / 1_000_000;
}

export function normalizeGoogleAdsCustomer(
  input: GoogleAdsCustomerInput,
): NormalizedAdAccount {
  return {
    currency: input.currencyCode,
    externalAccountId: input.id,
    name: input.descriptiveName,
    platform: 'google-ads',
    status: input.isManager ? 'manager' : 'active',
    timezone: input.timeZone,
  };
}

export function normalizeGoogleAdsCampaign(
  input: GoogleAdsCampaignInput,
  externalAccountId?: string,
): NormalizedAdCampaign {
  return {
    budgetAmountMicros: input.budgetAmountMicros,
    channelType: input.advertisingChannelType,
    endDate: input.endDate,
    externalAccountId,
    externalCampaignId: input.id,
    name: input.name,
    platform: 'google-ads',
    startDate: input.startDate,
    status: input.status,
  };
}

export function normalizeGoogleAdsCampaignMetricsRecord(input: {
  currency: string;
  externalAccountId: string;
  metrics: GoogleAdsCampaignMetricsInput;
}): NormalizedAdPerformanceRecord {
  const spend = microsToCurrency(input.metrics.costMicros);
  const revenue =
    input.metrics.conversionsValue > 0
      ? input.metrics.conversionsValue
      : undefined;
  const roas = revenue !== undefined && spend > 0 ? revenue / spend : undefined;
  const cpa =
    input.metrics.conversions > 0
      ? spend / input.metrics.conversions
      : undefined;

  return {
    campaignName: input.metrics.campaignName,
    campaignStatus: undefined,
    clicks: input.metrics.clicks,
    conversions: input.metrics.conversions,
    cpa,
    cpc: input.metrics.averageCpc,
    cpm: input.metrics.averageCpm,
    ctr: input.metrics.ctr,
    currency: input.currency,
    dataConfidence: revenue !== undefined ? 1 : 0.7,
    date: input.metrics.date ?? '',
    externalAccountId: input.externalAccountId,
    externalCampaignId: input.metrics.campaignId,
    granularity: 'campaign',
    impressions: input.metrics.impressions,
    platform: 'google-ads',
    revenue,
    roas,
    spend,
  };
}
