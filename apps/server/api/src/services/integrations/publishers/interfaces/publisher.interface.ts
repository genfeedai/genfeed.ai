import type { CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import type { OrganizationDocument } from '@api/collections/organizations/schemas/organization.schema';
import { PostEntity } from '@api/collections/posts/entities/post.entity';
import { CredentialPlatform, PostCategory, PostStatus } from '@genfeedai/enums';

/**
 * Result of a publish operation
 */
export interface PublishResult {
  success: boolean;
  externalId: string | null;
  externalShortcode?: string | null;
  platform: CredentialPlatform | string;
  url: string;
  status: PostStatus;
  error?: string;
}

/**
 * Context for publishing - contains all necessary data
 */
export interface PublishContext {
  post: PostEntity;
  credential: CredentialDocument;
  organization: OrganizationDocument;
  organizationId: string;
  brandId: string;
  postId: string;
  isDraft?: boolean;
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
  _id: { toString(): string } | string;
  category?: PostCategory | string;
  description?: string | null;
  ingredients?: Array<{ _id?: { toString(): string } | string } | string>;
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
  ): { valid: boolean; error?: string };
}
