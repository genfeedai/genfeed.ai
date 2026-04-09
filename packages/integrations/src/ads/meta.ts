import type {
  MetaActionValue,
  MetaAdAccountInput,
  MetaCampaignInput,
  MetaCampaignInsightInput,
  NormalizedAdAccount,
  NormalizedAdCampaign,
  NormalizedAdPerformanceRecord,
} from './types';

function toFiniteNumber(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) {
    return undefined;
  }

  return value;
}

export function extractMetaRevenue(
  actionValues?: MetaActionValue[],
): number | undefined {
  if (!actionValues || actionValues.length === 0) {
    return undefined;
  }

  const purchaseAction = actionValues.find(
    (action) =>
      action.actionType === 'purchase' ||
      action.actionType === 'omni_purchase' ||
      action.actionType === 'offsite_conversion.fb_pixel_purchase',
  );

  if (!purchaseAction) {
    return undefined;
  }

  const revenue = Number(purchaseAction.value);
  return Number.isFinite(revenue) ? revenue : undefined;
}

export function computeAdDataConfidence(input: {
  conversions?: number;
  revenue?: number;
}): number {
  if (input.revenue !== undefined && input.conversions !== undefined) {
    return 1;
  }

  if (input.conversions !== undefined) {
    return 0.7;
  }

  return 0.5;
}

export function normalizeMetaAdAccount(
  input: MetaAdAccountInput,
): NormalizedAdAccount {
  return {
    currency: input.currency,
    externalAccountId: input.id,
    name: input.name,
    platform: 'meta',
    status: input.status,
    timezone: input.timezone,
  };
}

export function normalizeMetaCampaign(
  input: MetaCampaignInput,
  externalAccountId?: string,
): NormalizedAdCampaign {
  return {
    dailyBudget: input.dailyBudget,
    endDate: input.stopTime,
    externalAccountId,
    externalCampaignId: input.id,
    lifetimeBudget: input.lifetimeBudget,
    name: input.name,
    objective: input.objective,
    platform: 'meta',
    startDate: input.startTime,
    status: input.status,
  };
}

export function normalizeMetaCampaignInsightRecord(input: {
  campaign: MetaCampaignInput;
  currency?: string;
  externalAccountId: string;
  insight: MetaCampaignInsightInput;
}): NormalizedAdPerformanceRecord {
  const revenue = extractMetaRevenue(input.insight.actionValues);
  const spend = Number(input.insight.spend);
  const conversions = toFiniteNumber(input.insight.conversions);
  const roas =
    revenue !== undefined && spend > 0
      ? toFiniteNumber(revenue / spend)
      : undefined;

  return {
    bodyText: undefined,
    campaignName: input.campaign.name,
    campaignObjective: input.campaign.objective,
    campaignStatus: input.campaign.status,
    clicks: Number(input.insight.clicks),
    conversions,
    cpa: toFiniteNumber(input.insight.costPerResult),
    cpc: Number(input.insight.cpc),
    cpm: Number(input.insight.cpm),
    ctaText: undefined,
    ctr: Number(input.insight.ctr),
    currency: input.currency ?? 'USD',
    dataConfidence: computeAdDataConfidence({ conversions, revenue }),
    date: input.insight.dateStart,
    externalAccountId: input.externalAccountId,
    externalCampaignId: input.campaign.id,
    granularity: 'campaign',
    headlineText: undefined,
    impressions: Number(input.insight.impressions),
    platform: 'meta',
    revenue,
    roas,
    spend,
  };
}
