import type { CredentialDocument } from '@api/collections/credentials/credential.types';
import {
  CredentialPlatform,
  PostCategory,
  type PostVisibility,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type { ChannelTargetSettings } from '@genfeedai/contracts/api-types/contracts';
import type { Organization } from '@genfeedai/prisma';

type PublisherRecordId = { toString(): string } | string;

/** API-owned post fields read by the shared publisher contract and base. */
export interface PublisherPostInput {
  category: PostCategory;
  description: string;
  id: PublisherRecordId;
  ingredients: Array<{ id?: PublisherRecordId } | string>;
  isShareToFeedSelected?: boolean;
  label: string;
  quoteTweetId?: string;
  scheduledDate: Date;
  tags?: string[];
  visibility?: PostVisibility | null;
}

/**
 * Ephemeral scheduler metadata added only after stored target settings have
 * been resolved against the capability catalog. Publishers must never accept
 * this value directly from persisted user settings.
 */
export const WORKFLOW_APPROVED_SCHEDULE_SETTING =
  '__workflowApprovedScheduledAt';

/**
 * Ephemeral execution flag set by the scheduled-post workflow when a creator
 * chooses the TikTok native-app handoff. It is never persisted as a customer
 * channel setting; the TikTok publisher alone consumes it.
 */
export const TIKTOK_APP_HANDOFF_SETTING = '__tiktokAppHandoff';

/**
 * Result of a publish operation
 */
export interface PublishResult {
  executionState: TargetExecutionState;
  success: boolean;
  externalId: string | null;
  externalShortcode?: string | null;
  platform: CredentialPlatform | string;
  url: string;
  error?: string;
  /**
   * Stable machine code set by pre-publish validation failures (never by
   * provider errors). Its presence tells the publish worker the failure is
   * deterministic — retrying cannot succeed — and it becomes
   * `IChannelTargetError.code` instead of a message-pattern classification.
   */
  errorCode?: string;
  /**
   * Set when the provider accepted the content but parked it as a draft on
   * its side (e.g. a Beehiiv draft execution mode) instead of making it live.
   *
   * This is a provider execution outcome, not a lifecycle or audience axis:
   * the target still reaches `TargetExecutionState.PUBLISHED` because the
   * provider record exists, but nothing is announced — no publish webhook, no
   * published activity, no repeat scheduling, and no publish timestamps.
   */
  isProviderDraft?: boolean;
}

/**
 * Result of validating a post against platform constraints before publishing
 */
export interface PostValidationResult {
  valid: boolean;
  error?: string;
  /** Stable machine code for the validation failure (e.g. `caption_too_long`). */
  errorCode?: string;
}

/**
 * Context for publishing - contains all necessary data
 */
export interface PublishContext {
  post: PublisherPostInput;
  credential: CredentialDocument;
  organization: Organization;
  organizationId: string;
  brandId: string;
  postId: string;
  isDraft?: boolean;
  /**
   * Channel settings resolved from `post.targetSettings` against the current
   * capability catalog. Always present — publishers read it instead of the raw
   * JSON so a stale or unknown key can never reach a provider API.
   */
  settings: ChannelTargetSettings;
  /** Canonical audience axis resolved before provider execution. */
  visibility?: PostVisibility;
}

/**
 * Media info extracted from post
 */
export interface MediaInfo {
  ingredientIds: string[];
  mediaUrls: string[];
  isImagePost: boolean;
  isCarousel: boolean;
  hasIngredients: boolean;
}

export type ThreadChild = {
  id: { toString(): string } | string;
  category?: PostCategory | string;
  description?: string | null;
  ingredients?: Array<{ id?: { toString(): string } | string } | string>;
  order?: number;
};

/**
 * Interface for platform-specific publishers
 * Each platform implements its own publishing logic
 */
export interface IPublisher {
  /**
   * The platform this publisher handles
   */
  readonly platform: CredentialPlatform;

  /**
   * Whether this platform supports text-only posts
   */
  readonly supportsTextOnly: boolean;

  /**
   * Whether this platform supports image posts
   */
  readonly supportsImages: boolean;

  /**
   * Whether this platform supports video posts
   */
  readonly supportsVideos: boolean;

  /**
   * Whether this platform supports carousel/multi-image posts
   */
  readonly supportsCarousel: boolean;

  /**
   * Whether this platform supports threads (linked posts)
   */
  readonly supportsThreads: boolean;

  /**
   * Publish a post to this platform
   * @param context The publishing context with all necessary data
   * @returns The result of the publish operation
   */
  publish(context: PublishContext): Promise<PublishResult>;

  /**
   * Publish thread children (for platforms that support threads)
   * @param context The publishing context
   * @param children The child posts to publish
   * @param parentExternalId The external ID of the parent post
   */
  publishThreadChildren?(
    context: PublishContext,
    children: ThreadChild[],
    parentExternalId: string,
  ): Promise<void>;

  /**
   * Build the URL for a published post
   * @param externalId The external ID of the post
   * @param credential The credential used for publishing
   * @param externalShortcode Optional shortcode (e.g., for Instagram)
   */
  buildPostUrl(
    externalId: string,
    credential: CredentialDocument,
    externalShortcode?: string,
  ): string;

  /**
   * Validate that a post can be published on this platform
   * @param context The publishing context
   * @param mediaInfo Media information for the post
   * @returns Validation result with error message if invalid
   */
  validatePost(
    context: PublishContext,
    mediaInfo: MediaInfo,
  ): PostValidationResult;
}
