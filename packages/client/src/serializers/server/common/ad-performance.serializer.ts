export interface AdPerformanceSerializedData {
  id: string;
  adPlatform: string;
  granularity: string;
  campaignName?: string;
  campaignObjective?: string;
  campaignStatus?: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions?: number;
  revenue?: number;
  ctr: number;
  cpc: number;
  cpm: number;
  cpa?: number;
  roas?: number;
  performanceScore: number;
  date: string;
}

export interface AdInsightsSerializedData {
  insightType: string;
  adPlatform?: string;
  industry?: string;
  data: Record<string, unknown>;
  sampleSize: number;
  computedAt: string;
  validUntil: string;
}

export function serializeAdPerformance(
  doc: Record<string, unknown>,
): AdPerformanceSerializedData {
  return {
    adPlatform: String(doc.adPlatform || ''),
    campaignName: doc.campaignName as string | undefined,
    campaignObjective: doc.campaignObjective as string | undefined,
    campaignStatus: doc.campaignStatus as string | undefined,
    clicks: Number(doc.clicks || 0),
    conversions: doc.conversions as number | undefined,
    cpa: doc.cpa as number | undefined,
    cpc: Number(doc.cpc || 0),
    cpm: Number(doc.cpm || 0),
    ctr: Number(doc.ctr || 0),
    date: String(doc.date || ''),
    granularity: String(doc.granularity || ''),
    id: String(doc._id || doc.id || ''),
    impressions: Number(doc.impressions || 0),
    performanceScore: Number(doc.performanceScore || 0),
    revenue: doc.revenue as number | undefined,
    roas: doc.roas as number | undefined,
    spend: Number(doc.spend || 0),
  };
}

export function serializeAdInsights(
  doc: Record<string, unknown>,
): AdInsightsSerializedData {
  return {
    adPlatform: doc.adPlatform as string | undefined,
    computedAt: String(doc.computedAt || ''),
    data: (doc.data as Record<string, unknown>) || {},
    industry: doc.industry as string | undefined,
    insightType: String(doc.insightType || ''),
    sampleSize: Number(doc.sampleSize || 0),
    validUntil: String(doc.validUntil || ''),
  };
}

export function serializeAdPerformanceForPublic(
  doc: Record<string, unknown>,
): Omit<AdPerformanceSerializedData, 'campaignName'> {
  const serialized = serializeAdPerformance(doc);
  const { campaignName: _, ...publicData } = serialized;
  return publicData;
}
