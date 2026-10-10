import type { SocialSourcePlatform } from '@genfeedai/contracts';
import type {
  BreakoutExposureEvidence,
  BreakoutExposureMetric,
  BreakoutOwnedProviderAttempt,
} from '@genfeedai/contracts/interfaces';
import type { LearningFormat } from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';

/**
 * Provider-agnostic post collected for Following / social sources.
 * Maps cleanly into SocialMonitor SocialContentData / sourcePost rows.
 */
export type CollectedSourcePost = {
  nativeAuthorVerified?: boolean;
  nativeFormat?: LearningFormat;
  attachmentMediaKeys?: string[];
  breakoutExposures?: Partial<
    Record<BreakoutExposureMetric, BreakoutExposureEvidence>
  >;
  isPinned?: boolean | null;
  isPromoted?: boolean | null;
  id: string;
  text: string;
  platform: SocialSourcePlatform | string;
  authorId?: string;
  authorUsername?: string;
  authorDisplayName?: string;
  authorAvatarUrl?: string;
  authorFollowersCount?: number;
  contentType?: string;
  contentUrl?: string;
  createdAt?: Date;
  mediaUrls?: string[];
  thumbnailUrl?: string;
  inReplyToId?: string | null;
  isRepost?: boolean;
  metrics?: {
    likes?: number;
    comments?: number;
    shares?: number;
    views?: number;
    /** Official own-account insights; absent for public/scraped timelines. */
    impressions?: number;
    reach?: number;
    saves?: number;
  };
  hashtags?: string[];
};

export type SourceCollectContext = {
  /** Server-owned request for evidence only; no actor or provider enablement. */
  captureBreakoutEvidence?: boolean;
  organizationId?: string;
  brandId?: string;
  /**
   * Which of the brand's accounts to collect as. A brand may hold several
   * accounts on one platform; omitted collects as the brand's default account.
   */
  credentialId?: string;
  limit?: number;
  sinceId?: string;
  /** Oldest publish date to collect; providers stop paginating past it. */
  since?: Date;
  includeReplies?: boolean;
  includeReposts?: boolean;
};

export type SourceCollectResult = {
  breakoutAttempt?: BreakoutOwnedProviderAttempt;
  posts: CollectedSourcePost[];
  /** Which provider fulfilled the request */
  provider:
    | 'brand-oauth'
    | 'app-bearer'
    | 'app-api-key'
    | 'apify'
    | 'social-monitor'
    | 'none';
  platform: SocialSourcePlatform | string;
  handle: string;
};

export type SourceProviderName =
  | 'brand-oauth'
  | 'app-bearer'
  | 'app-api-key'
  | 'apify'
  | 'social-monitor';

export interface SocialSourceResearchContext {
  organizationId: string | undefined;
  origin: 'social-source';
}

/**
 * Why one provider in the chain could not collect. Access classes
 * (`unauthorized`, `payment_required`, `forbidden`, `rate_limited`) need the
 * user or operator to reconnect, top up, or wait; they are not server faults.
 */
export type SourceCollectorFailureReason =
  | 'unauthorized'
  | 'payment_required'
  | 'forbidden'
  | 'rate_limited'
  | 'not_found'
  | 'unavailable'
  | 'error';

export type SourceCollectorFailure = {
  provider: SourceProviderName | 'none';
  reason: SourceCollectorFailureReason;
  /** Upstream HTTP status when the provider reported one. */
  status?: number;
};
