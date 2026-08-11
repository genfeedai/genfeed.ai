import type { ContentIntelligencePlatform } from '@genfeedai/enums';
import type { Request } from 'express';

export type PostVariationSourceKind =
  | 'owned-post'
  | 'source-post'
  | 'trend-reference';

export interface ResolvedPostVariationSource {
  id: string;
  kind: PostVariationSourceKind;
  platform?: string;
  sourceUrl?: string;
  text: string;
  trendId?: string;
}

export type PostVariationVoiceMode = 'brand-voice' | 'organization-defaults';

export interface PostVariationResponseMeta {
  actualCount: number;
  creditCost: number;
  groupId: string;
  partialReason?: string;
  requestedCount: number;
  reviewBatchId: string;
  sourceKind: PostVariationSourceKind;
  voiceMode: PostVariationVoiceMode;
  voiceModeLabel: string;
}

export interface SourcePostVariationRequest extends Request {
  creditsOutputCount?: number;
  resolvedPostVariationSource?: ResolvedPostVariationSource;
}

export interface GeneratePostVariationsParams {
  brandId: string;
  count: number;
  organizationId: string;
  platform: ContentIntelligencePlatform;
  source: ResolvedPostVariationSource;
  userId: string;
}
