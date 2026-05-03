export interface ContentRunBrief {
  angle?: string;
  audience?: string;
  callToAction?: string;
  channelFit?: string;
  confidence?: number;
  evidence?: string[];
  hypothesis?: string;
  notes?: string;
  risk?: string;
  sourceId?: string;
  sourceUrl?: string;
}

export interface ContentRunVariant {
  angle?: string;
  assetIds?: string[];
  content?: string;
  format?: string;
  hypothesis?: string;
  id: string;
  metadata: Record<string, unknown>;
  platform: string;
  status?: string;
  type: string;
}

export interface ContentRunPublishContext {
  channel?: string;
  experimentId?: string;
  metadata: Record<string, unknown>;
  platform?: string;
  postIds?: string[];
  publishedAt?: Date;
  scheduledFor?: Date;
  variantId?: string;
}

export interface ContentRunAnalyticsSummary {
  engagementRate?: number;
  engagements?: number;
  impressions?: number;
  metadata: Record<string, unknown>;
  summary?: string;
  topSignals?: string[];
  winningVariantId?: string;
}

export interface ContentRunRecommendation {
  action?: string;
  confidence?: number;
  metadata: Record<string, unknown>;
  rationale?: string;
  type: string;
}
