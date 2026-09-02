import { BaseEntity } from '@api/entities/base.entity';
import {
  CredentialPlatform,
  PostCategory,
  PostFormat,
  PostStatus,
  PostVisibility,
  type ReviewDecision,
  TargetExecutionState,
} from '@genfeedai/contracts';

export interface PostAnalyticsSummary {
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  totalSaves: number;
  avgEngagementRate: number;
  platforms: Record<
    string,
    {
      totalViews: number;
      totalLikes: number;
      totalComments: number;
      totalShares: number;
      totalSaves: number;
      engagementRate: number;
    }
  >;
}

export class PostEntity extends BaseEntity {
  declare readonly ingredients: string[];
  declare readonly brandId: string;
  declare readonly credentialId?: string | null;
  declare readonly organizationId: string;
  declare readonly userId: string;
  declare readonly groupId?: string | null;
  declare readonly campaignId?: string | null;
  declare readonly children?: string[];
  declare readonly agentContextSource?: string;
  declare readonly agentContextVersion?: number;
  declare readonly agentThreadId?: string;

  declare readonly externalId: string;
  declare readonly externalShortcode?: string;
  declare readonly quoteTweetId?: string;

  declare readonly label: string;
  declare readonly description: string;
  declare readonly category: PostCategory;
  declare readonly format: PostFormat;
  declare readonly status: PostStatus;
  declare readonly targetExecutionState: TargetExecutionState;
  declare readonly visibility?: PostVisibility | null;
  declare readonly tags?: string[];
  declare readonly scheduledDate: Date;
  declare readonly publicationDate: Date;

  declare readonly publishedAt?: Date;
  declare readonly uploadedAt?: Date;

  declare readonly platform?: CredentialPlatform | null;
  // Per-channel publishing settings captured at schedule time. Stored as
  // untyped JSON, so the publish path must run it through
  // `resolveChannelTargetSettings` before acting on any key.
  declare readonly targetSettings?: unknown;
  declare readonly targetValidationState?: string;
  declare readonly nextScheduledDate: Date;
  declare readonly isRepeat: boolean;
  declare readonly repeatFrequency: string;
  declare readonly repeatInterval: number;
  declare readonly repeatEndDate: Date;
  declare readonly maxRepeats: number;
  declare readonly repeatCount: number;
  declare readonly repeatDaysOfWeek: number[];
  declare readonly timezone: string;
  declare readonly isShareToFeedSelected: boolean;
  declare readonly isAnalyticsEnabled: boolean;
  declare readonly analyticsNextCollectAt?: Date;
  declare readonly retryCount?: number;
  declare readonly lastAttemptAt?: Date;
  declare readonly promptUsed?: string;
  declare readonly generationId?: string;
  declare readonly contentRunId?: string;
  declare readonly personaId?: string;
  declare readonly variantId?: string;
  declare readonly hookVersion?: string;
  declare readonly creativeVersion?: string;
  declare readonly scheduleSlot?: string;
  declare readonly publishIntent?: string;
  declare readonly reviewBatchId?: string;
  declare readonly reviewItemId?: string;
  declare readonly reviewDecision?: ReviewDecision;
  declare readonly reviewFeedback?: string;
  declare readonly reviewVersionPinId?: string;
  declare readonly publishApprovalId?: string;
  declare readonly publishApproval?: {
    artifactVersionPinId: string;
    id: string;
    operationId: string;
    status?: string;
  };
  declare readonly reviewedAt?: Date;
  declare readonly reviewEvents?: Array<{
    decision: ReviewDecision;
    feedback?: string;
    reviewedAt: Date;
  }>;
  declare readonly sourceActionId?: string;
  declare readonly listeningTopicId?: string;
  declare readonly listeningThemeId?: string;
  declare readonly listeningEvidenceIds?: string[];
  declare readonly sourceWorkflowId?: string;
  declare readonly sourceWorkflowName?: string;

  declare readonly isDeleted: boolean;

  // Analytics (nested object - populated in detail views only)
  declare readonly analytics?: PostAnalyticsSummary;

  // Flattened analytics fields (convenience accessors - populated during serialization)
  declare readonly totalViews?: number;
  declare readonly totalLikes?: number;
  declare readonly totalComments?: number;
  declare readonly totalShares?: number;
  declare readonly totalSaves?: number;
  declare readonly avgEngagementRate?: number;
}
