import { Post } from '@api/collections/posts/schemas/post.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { CredentialPlatform, PostCategory, PostStatus } from '@genfeedai/enums';

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

export class PostEntity extends BaseEntity implements Post {
  declare readonly ingredients: string[];
  declare readonly credential: string;
  declare readonly user: string;
  declare readonly brand: string;
  declare readonly organization: string;
  declare readonly children?: string[];

  declare readonly externalId: string;
  declare readonly externalShortcode?: string;
  declare readonly quoteTweetId?: string;

  declare readonly label: string;
  declare readonly description: string;
  declare readonly category: PostCategory;
  declare readonly status: PostStatus;
  declare readonly tags?: string[];
  declare readonly scheduledDate: Date;
  declare readonly publicationDate: Date;

  declare readonly publishedAt?: Date;
  declare readonly uploadedAt?: Date;

  declare readonly platform: CredentialPlatform;
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
  declare readonly retryCount?: number;
  declare readonly lastAttemptAt?: Date;
  declare readonly promptUsed?: string;
  declare readonly generationId?: string;
  declare readonly reviewBatchId?: string;
  declare readonly reviewItemId?: string;
  declare readonly reviewDecision?: 'approved' | 'rejected' | 'request_changes';
  declare readonly reviewFeedback?: string;
  declare readonly reviewedAt?: Date;
  declare readonly reviewEvents?: Array<{
    decision: 'approved' | 'rejected' | 'request_changes';
    feedback?: string;
    reviewedAt: Date;
  }>;
  declare readonly sourceActionId?: string;
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
