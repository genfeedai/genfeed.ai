import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import type { ContentIntelligencePlatform } from '@genfeedai/contracts';
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

export interface SourcePostVariationRequest extends Omit<Request, 'user'> {
  creditsOutputCount?: number;
  resolvedPostVariationSource?: ResolvedPostVariationSource;
  user?: AuthenticatedUser;
}

export interface GeneratePostVariationsParams {
  brandId: string;
  count: number;
  organizationId: string;
  platform: ContentIntelligencePlatform;
  source: ResolvedPostVariationSource;
  userId: string;
}
