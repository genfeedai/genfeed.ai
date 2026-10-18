import type {
  CredentialPlatform,
  PostCategory,
  PostFormat,
  PostVisibility,
  ReviewDecision,
  SourcePostVariationPlatform,
  TargetExecutionState,
} from '../..';
import type { IPostAnalyticsSummary } from '../analytics/analytics.interface';
import type {
  IBaseEntity,
  IBrand,
  ICredential,
  IEvaluation,
  IIngredient,
  IOrganization,
  ITag,
  IUser,
} from '../index';
import type { IBrandPolicyViolation } from '../organization/brand-publish-policy.interface';
import type { IPublishApproval } from '../publisher/publish-approval.interface';
import type { IChannelTargetError } from '../scheduler/channel-target.interface';
import type { SeoScorecardSnapshot } from './seo-scorecard.interface';

export interface IPost extends IBaseEntity {
  ingredients: IIngredient[];
  category: PostCategory;
  format?: PostFormat;
  credential?: ICredential;
  credentialId?: string;
  user: IUser;
  userId?: string;
  organization: IOrganization;
  organizationId?: string;
  brand: IBrand;
  platform?: CredentialPlatform;
  externalId?: string;
  externalShortcode?: string;
  groupId?: string;
  campaignId?: string | null;
  url?: string;
  label?: string;
  description?: string;
  tags?: ITag[];
  status: string;
  targetExecutionState: TargetExecutionState;
  targetSettings?: Record<string, unknown> | null;
  visibility?: PostVisibility;
  scheduledDate?: string | null;
  timezone?: string | null;
  uploadedAt: string;
  publicationDate: string;
  publishedAt?: string;
  retryCount?: number;
  targetError?: IChannelTargetError | null;
  originalPostId?: string | null;
  reviewTurboRunId?: string | null;
  reviewDecision?: ReviewDecision;
  reviewEvents?: Array<{
    decision: ReviewDecision;
    feedback?: string;
    reviewedAt: string;
  }>;
  /** Brand Policy rules this draft broke at the publish gate (#7339). */
  policyViolations?: IBrandPolicyViolation[];
  reviewFeedback?: string | null;
  reviewedAt?: string | null;
  reviewItemId?: string | null;
  reviewVersionPinId?: string | null;
  publishApprovalId?: string | null;
  publishApproval?: IPublishApproval | null;
  analytics?: IPostAnalyticsSummary;
  totalViews?: number;
  totalLikes?: number;
  totalComments?: number;
  totalShares?: number;
  totalSaves?: number;
  avgEngagementRate?: number;
  evalScore?: number | null;
  evaluation?: IEvaluation | null;
  seoScore?: number | null;
  seoBreakdown?: SeoScorecardSnapshot | null;
  parent?: string;
  children?: IPost[];
  order?: number;
  isShareToFeedSelected?: boolean;
  platformUrl?: string | null;
  sourceActionId?: string | null;
  listeningTopicId?: string | null;
  listeningThemeId?: string | null;
  listeningEvidenceIds?: string[];
  source?: string | null;
  sourceWorkflowId?: string | null;
  sourceWorkflowName?: string | null;
  contentRunId?: string | null;
  generationId?: string | null;
  /** Branded generation receipt that produced the text, with its state when the dispatch finished. */
  brandedReceiptId?: string | null;
  brandedReceiptState?: string | null;
  variantId?: string | null;
  workflowExecutionId?: string | null;
}

export type PostVariationSourceKind =
  | 'owned-post'
  | 'source-post'
  | 'trend-reference';

export type PostVariationVoiceMode = 'brand-voice' | 'organization-defaults';

export interface GenerateSourcePostVariationsInput {
  count?: number;
  platform: SourcePostVariationPlatform;
  postId?: string;
  sourcePostId?: string;
  sourceReferenceId?: string;
  trendId?: string;
}

export interface IPostVariationMeta {
  actualCount: number;
  creditCost: number;
  /**
   * Optional on the client: the response meta is cast from transport JSON
   * without runtime validation, so consumers must guard before rendering.
   */
  groupId?: string;
  partialReason?: string;
  requestedCount: number;
  /** Optional on the client for the same unvalidated-transport reason. */
  reviewTurboRunId?: string;
  sourceKind: PostVariationSourceKind;
  voiceMode: PostVariationVoiceMode;
  voiceModeLabel: string;
}

export interface IPostVariationResult {
  meta: IPostVariationMeta;
  posts: IPost[];
}

export interface IPostPlatformConfig {
  credentialId: string;
  platform: string;
  handle: string;
  label: string;
  description: string;
  overrideSchedule: boolean;
  customScheduledDate: string;
  targetExecutionState: TargetExecutionState;
  visibility: PostVisibility;
  enabled: boolean;
  isCredentialValid?: boolean;
  category?: PostCategory;
  isShareToFeedSelected?: boolean;
  referenceState?: string;
  signatureIds?: string[];
}
