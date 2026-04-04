import { CredentialEntity } from '@api/collections/credentials/entities/credential.entity';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { IngredientEntity } from '@api/collections/ingredients/entities/ingredient.entity';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { CreatePostDto } from '@api/collections/posts/dto/create-post.dto';
import { UpdatePostDto } from '@api/collections/posts/dto/update-post.dto';
import {
  Post,
  type PostDocument,
} from '@api/collections/posts/schemas/post.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { ObjectIdUtil } from '@api/helpers/utils/objectid/objectid.util';
import { CacheService } from '@api/services/cache/services/cache.service';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import { TimezoneUtil } from '@api/shared/utils/timezone/timezone.util';
import type { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import type { PopulateOption } from '@genfeedai/interfaces';
import type { IOnboardingJourneyMissionState } from '@genfeedai/types';
import { CredentialPlatform, PostStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';

const ONBOARDING_JOURNEY_REWARD_EXPIRY_MS = 365 * 24 * 60 * 60 * 1000;

@Injectable()
export class PostsService extends BaseService<
  PostDocument,
  CreatePostDto,
  UpdatePostDto
> {
  constructor(
    @InjectModel(Post.name, DB_CONNECTIONS.CLOUD)
    protected readonly model: AggregatePaginateModel<PostDocument>,

    public readonly logger: LoggerService,
    @Optional() public readonly cacheService?: CacheService,
    @Optional() private readonly fileQueueService?: FileQueueService,
    @Optional()
    private readonly organizationSettingsService?: OrganizationSettingsService,
    @Optional() private readonly creditsUtilsService?: CreditsUtilsService,
  ) {
    super(model, logger, undefined, cacheService);
  }

  create(
    dto: CreatePostDto & {
      user: Types.ObjectId;
      organization: Types.ObjectId;
      brand: Types.ObjectId;
      platform: CredentialPlatform;
    },
    populate: PopulateOption[] = [
      PopulatePatterns.ingredientsMinimal,
      PopulatePatterns.credentialMinimal,
      PopulatePatterns.userMinimal,
      PopulatePatterns.brandMinimal,
    ],
  ): Promise<PostDocument> {
    // Normalize ObjectId fields — DTO fields are Types.ObjectId but may arrive as strings at runtime
    const normalizedIngredients =
      dto.ingredients !== undefined
        ? ObjectIdUtil.normalizeArrayToObjectIds(
            dto.ingredients as unknown as Array<Types.ObjectId | string>,
          )
        : undefined;
    const normalizedCredential = ObjectIdUtil.normalizeToObjectId(
      dto.credential as unknown as Types.ObjectId | string,
    );
    const normalizedParent = ObjectIdUtil.normalizeToObjectId(
      dto.parent as unknown as Types.ObjectId | string | undefined,
    );

    // Build normalized DTO
    const normalizedDto = {
      ...dto,
      ...(normalizedIngredients !== undefined && {
        ingredients: normalizedIngredients,
      }),
      ...(normalizedCredential !== undefined && {
        credential: normalizedCredential,
      }),
      parent: normalizedParent,
    };

    // Convert scheduledDate from user timezone to UTC if timezone is provided
    if (dto.scheduledDate && dto.timezone) {
      const convertedDate = TimezoneUtil.convertToUTC(
        new Date(dto.scheduledDate),
        dto.timezone,
      );

      this.logger.log(
        `Converting scheduledDate from ${dto.timezone} to UTC: ${dto.scheduledDate} → ${convertedDate.toISOString()}`,
      );

      normalizedDto.scheduledDate = convertedDate;
    }

    return super.create(normalizedDto, populate);
  }

  findOne(
    params: Record<string, unknown>,
    populate: PopulateOption[] = [
      PopulatePatterns.ingredientsMinimal,
      PopulatePatterns.credentialMinimal,
      PopulatePatterns.userMinimal,
      PopulatePatterns.brandMinimal,
    ],
  ): Promise<PostDocument | null> {
    return super.findOne(params, populate);
  }

  /**
   * Batch find posts by IDs with organization isolation.
   * More efficient than individual findOne calls in a loop (N+1 problem).
   *
   * @param ids - Array of post IDs to find
   * @param organizationId - Organization ID for tenant isolation
   * @param populate - Population options
   * @returns Array of found posts (may be fewer than requested if some don't exist)
   */
  async findByIds(
    ids: (string | Types.ObjectId)[],
    organizationId: string | Types.ObjectId,
    populate: PopulateOption[] = [
      PopulatePatterns.ingredientsMinimal,
      PopulatePatterns.credentialMinimal,
    ],
  ): Promise<PostDocument[]> {
    if (!ids || ids.length === 0) {
      return [];
    }

    const objectIds = ids.map((id) =>
      id instanceof Types.ObjectId ? id : new Types.ObjectId(id),
    );
    const orgObjectId =
      organizationId instanceof Types.ObjectId
        ? organizationId
        : new Types.ObjectId(organizationId);

    this.logger.debug('findByIds', {
      count: ids.length,
      organizationId: orgObjectId.toString(),
    });

    const result = await this.model
      .find({
        _id: { $in: objectIds },
        isDeleted: false,
        organization: orgObjectId,
      })
      .populate(populate as unknown as PopulateOption[])
      .exec();

    this.logger.debug('findByIds success', {
      found: result.length,
      requested: ids.length,
    });

    return result;
  }

  async patch(
    id: string,
    dto: Partial<UpdatePostDto>,
    populate: PopulateOption[] = [
      PopulatePatterns.ingredientsMinimal,
      PopulatePatterns.credentialMinimal,
      PopulatePatterns.userMinimal,
      PopulatePatterns.brandMinimal,
    ],
  ): Promise<PostDocument> {
    const isPublishingPost = dto.status === PostStatus.PUBLIC;
    let currentPost: PostDocument | null = null;

    if (dto.status === PostStatus.SCHEDULED || isPublishingPost) {
      currentPost = await this.findOne({ _id: id });
    }

    // Normalize ObjectId fields — DTO fields are Types.ObjectId but may arrive as strings at runtime
    const normalizedIngredients =
      dto.ingredients !== undefined
        ? (ObjectIdUtil.normalizeArrayToObjectIds(
            dto.ingredients as unknown as Array<Types.ObjectId | string>,
          ) ?? [])
        : undefined;
    const normalizedCredential = ObjectIdUtil.normalizeToObjectId(
      dto.credential as unknown as Types.ObjectId | string | undefined,
    );
    const normalizedParent =
      dto.parent !== undefined
        ? ObjectIdUtil.normalizeToObjectId(
            dto.parent as unknown as Types.ObjectId | string,
          )
        : undefined;

    // Build normalized DTO
    const normalizedDto: Partial<UpdatePostDto> = {
      ...dto,
      ...(normalizedIngredients !== undefined && {
        ingredients: normalizedIngredients,
      }),
      ...(normalizedCredential !== undefined && {
        credential: normalizedCredential,
      }),
      ...(normalizedParent !== undefined && { parent: normalizedParent }),
    };

    // Convert scheduledDate from user timezone to UTC if timezone is provided
    if (dto.scheduledDate && dto.timezone) {
      const convertedDate = TimezoneUtil.convertToUTC(
        new Date(dto.scheduledDate),
        dto.timezone,
      );

      this.logger.log(
        `Converting scheduledDate from ${dto.timezone} to UTC: ${dto.scheduledDate} → ${convertedDate.toISOString()}`,
      );

      (normalizedDto as Record<string, unknown>).scheduledDate = convertedDate;
    }

    // If parent post is being scheduled, automatically schedule all children
    if (dto.status === PostStatus.SCHEDULED) {
      if (currentPost && !currentPost.parent) {
        // Find all children and update them to SCHEDULED
        const updateResult = await this.model.updateMany(
          {
            isDeleted: false,
            parent: new Types.ObjectId(id),
            status: { $ne: PostStatus.PUBLIC }, // Don't update already published children
          },
          {
            $set: {
              status: PostStatus.SCHEDULED,
              // Optionally inherit scheduledDate from parent if provided
              ...(normalizedDto.scheduledDate && {
                scheduledDate: normalizedDto.scheduledDate,
              }),
            },
          },
        );

        this.logger.log(`Auto-scheduled children for parent post ${id}`, {
          childrenUpdated: updateResult.modifiedCount,
          parentId: id,
          status: PostStatus.SCHEDULED,
        });
      }
    }

    const updatedPost = await super.patch(id, normalizedDto, populate);

    if (
      isPublishingPost &&
      updatedPost &&
      updatedPost.status === PostStatus.PUBLIC &&
      currentPost?.status !== PostStatus.PUBLIC
    ) {
      await this.completePublishFirstPostMission(updatedPost);
    }

    return updatedPost;
  }

  private async completePublishFirstPostMission(
    post: Pick<PostDocument, 'organization'>,
  ): Promise<void> {
    if (!this.organizationSettingsService || !this.creditsUtilsService) {
      return;
    }

    const organizationId = String(post.organization);
    if (!organizationId) {
      return;
    }

    const settings = await this.organizationSettingsService.findOne({
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    });

    if (!settings?._id) {
      return;
    }

    const missions = this.organizationSettingsService.normalizeJourneyState(
      settings.onboardingJourneyMissions as
        | IOnboardingJourneyMissionState[]
        | undefined,
    );
    const mission = missions.find((item) => item.id === 'publish_first_post');

    if (!mission || mission.rewardClaimed) {
      return;
    }

    const updatedMissions = missions.map((item) =>
      item.id === 'publish_first_post'
        ? {
            ...item,
            completedAt: item.completedAt ?? new Date(),
            isCompleted: true,
            rewardClaimed: true,
          }
        : item,
    );
    const journeyCompleted = updatedMissions.every((item) => item.isCompleted);

    await this.organizationSettingsService.patch(String(settings._id), {
      onboardingJourneyCompletedAt: journeyCompleted
        ? settings.onboardingJourneyCompletedAt || new Date()
        : null,
      onboardingJourneyMissions: updatedMissions,
    });

    await this.creditsUtilsService.addOrganizationCreditsWithExpiration(
      organizationId,
      mission.rewardCredits,
      'onboarding-journey',
      'Onboarding journey reward: publish_first_post',
      new Date(Date.now() + ONBOARDING_JOURNEY_REWARD_EXPIRY_MS),
    );
  }

  @HandleErrors('get cached data', 'posts')
  async getCachedData(key: string): Promise<string | null> {
    return (await this.cacheService?.get<string>(key)) ?? null;
  }

  @HandleErrors('set cached data', 'posts')
  async setCachedData(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<void> {
    await this.cacheService?.set(key, value, { ttl: ttlSeconds });
  }

  /**
   * Handle YouTube post upload for all statuses (UNLISTED, PUBLIC, PRIVATE, SCHEDULED)
   * Enqueues the upload job and returns immediately
   */
  @HandleErrors('handle YouTube post', 'posts')
  async handleYoutubePost(post: PostDocument): Promise<void> {
    if (
      !post.credential ||
      !post.ingredients ||
      post.ingredients.length === 0
    ) {
      throw new Error('Post must have credential and at least one ingredient');
    }

    const credential = post.credential as unknown as CredentialEntity;
    // YouTube only supports single video uploads, use the first ingredient
    const ingredient = (
      post.ingredients as Types.ObjectId[]
    )[0] as unknown as IngredientEntity;

    if (credential.platform !== CredentialPlatform.YOUTUBE) {
      this.logger.warn(
        `handleYoutubePost called for non-YouTube platform: ${credential.platform}`,
      );
      return;
    }

    // Save original status before changing to PROCESSING
    const originalStatus = post.status;
    const postId: string = (post._id as Types.ObjectId).toString();

    await this.patch(postId, {
      status: PostStatus.PROCESSING,
    });

    // Enqueue YouTube upload job with original status so it can be restored on completion
    try {
      const user = post.user as unknown as { clerkId?: string };
      const clerkUserId: string | undefined =
        typeof user === 'object' && user?.clerkId ? user.clerkId : undefined;

      await this.fileQueueService?.uploadYoutube({
        brandId: post.brand.toString(),
        clerkUserId,
        credentialId: credential._id.toString(),
        description: post.description || '',
        ingredientId: ingredient._id.toString(),
        organizationId: post.organization.toString(),
        postId,
        room: clerkUserId ? `user-${clerkUserId}` : undefined,
        scheduledDate: post.scheduledDate,
        status: originalStatus, // Send original status so completion handler can restore it
        tags:
          (post.tags as unknown as ({ name?: string } | string)[])?.map(
            (tag) =>
              typeof tag === 'object' && tag?.name ? tag.name : String(tag),
          ) || [],
        title: post.label || 'Untitled',
        userId: post.user.toString(),
        websocketUrl: process.env.WEBSOCKET_URL,
      });

      this.logger.log(`YouTube upload job enqueued for post ${postId}`);
    } catch (error: unknown) {
      this.logger.error(
        `Failed to enqueue YouTube upload for post ${postId}: ${(error as Error)?.message}`,
        (error as Error)?.stack,
      );

      // Revert status to FAILED
      await this.patch(postId, {
        status: PostStatus.FAILED,
      });

      throw error;
    }
  }

  /**
   * Count posts matching filter
   */
  count(filter: Record<string, unknown>): Promise<number> {
    return this.model.countDocuments(filter);
  }

  /**
   * Create a thread (batch of posts with parent-child relationships)
   */
  @HandleErrors('create thread', 'posts')
  async createThread(
    threadPosts: Array<
      CreatePostDto & {
        user: Types.ObjectId;
        organization: Types.ObjectId;
        brand: Types.ObjectId;
        platform: CredentialPlatform;
      }
    >,
    populate: PopulateOption[] = [
      PopulatePatterns.ingredientsMinimal,
      PopulatePatterns.credentialMinimal,
      PopulatePatterns.userMinimal,
      PopulatePatterns.brandMinimal,
    ],
  ): Promise<PostDocument[]> {
    const createdPosts: PostDocument[] = [];

    if (threadPosts.length === 0) {
      return createdPosts;
    }

    // Create root post first (index 0)
    const { parent: _rootParent, ...rootPostWithoutParent } = threadPosts[0];
    const rootPostDto = {
      ...rootPostWithoutParent,
      order: 0,
      parent: undefined, // Root post has no parent
    };

    const rootPost = await this.create(rootPostDto, populate);
    createdPosts.push(rootPost);
    const rootPostId = rootPost._id as Types.ObjectId;

    // Create remaining posts sequentially, all children point to the root post (flat structure)
    // This allows simple queries to find all thread children
    // Order determines the sequence when publishing
    for (let i = 1; i < threadPosts.length; i++) {
      const { parent: _parent, ...postWithoutParent } = threadPosts[i];

      const postDto = {
        ...postWithoutParent,
        order: i,
        parent: new Types.ObjectId(rootPostId), // All subsequent posts point to the root post
      };

      const createdPost = await this.create(postDto, populate);
      createdPosts.push(createdPost);
    }

    return createdPosts;
  }

  /**
   * Get all children of a post.
   *
   * @param parentId - Parent post ID
   * @param populate - Population options
   * @param limit - Maximum number of children to return (default: 100, max: 500)
   * @returns Array of child posts
   */
  @HandleErrors('get post children', 'posts')
  async getChildren(
    parentId: string,
    populate: PopulateOption[] = [
      PopulatePatterns.ingredientsMinimal,
      PopulatePatterns.credentialMinimal,
      PopulatePatterns.userMinimal,
      PopulatePatterns.brandMinimal,
    ],
    limit: number = 100,
  ): Promise<PostDocument[]> {
    // Convert parentId to ObjectId to ensure proper matching
    const parentObjectId = new Types.ObjectId(parentId);
    // Enforce maximum limit to prevent DOS
    const safeLimit = Math.min(limit, 500);

    const children = await this.model
      .find({ isDeleted: false, parent: parentObjectId })
      .populate(populate as unknown as PopulateOption[])
      .sort({ order: 1 })
      .limit(safeLimit)
      .exec();

    return children;
  }

  /**
   * Find the root post of a thread (traverse up to find post with no parent).
   * Includes cycle detection and depth limit to prevent infinite loops.
   *
   * @param postId - Starting post ID
   * @param populate - Population options
   * @param maxDepth - Maximum traversal depth (default: 100)
   * @returns Root post or null if not found
   * @throws Error if circular reference or max depth exceeded
   */
  @HandleErrors('find root post', 'posts')
  async findRootPost(
    postId: string,
    populate: PopulateOption[] = [],
    maxDepth: number = 100,
  ): Promise<PostDocument | null> {
    let current = await this.findOne({ _id: postId }, populate);
    if (!current) {
      return null;
    }

    // Track visited IDs to detect cycles
    const visited = new Set<string>();
    visited.add(current._id.toString());

    let depth = 0;

    // Traverse up until we find a post with no parent (the root)
    while (current.parent) {
      depth++;

      // Check depth limit
      if (depth > maxDepth) {
        this.logger.error('Max depth exceeded in findRootPost', {
          depth,
          maxDepth,
          postId,
        });
        throw new BadRequestException(
          `Max hierarchy depth (${maxDepth}) exceeded for post ${postId}`,
        );
      }

      const parentId = current.parent.toString();

      // Check for circular reference
      if (visited.has(parentId)) {
        this.logger.error('Circular reference detected in post hierarchy', {
          currentId: current._id.toString(),
          parentId,
          postId,
          visited: Array.from(visited),
        });
        throw new BadRequestException(
          `Circular reference detected in post hierarchy: ${parentId}`,
        );
      }

      visited.add(parentId);

      const parent = await this.findOne({ _id: current.parent }, populate);
      if (!parent) {
        break;
      }
      current = parent;
    }

    return current;
  }

  /**
   * Add a reply to an existing post (thread reply)
   * Reply is always attached to the ROOT post of the thread (flat structure)
   * This allows simple queries to find all thread children
   */
  @HandleErrors('add thread reply', 'posts')
  async addThreadReply(
    parentId: string,
    dto: CreatePostDto & {
      user: Types.ObjectId;
      organization: Types.ObjectId;
      brand: Types.ObjectId;
      platform: CredentialPlatform;
    },
    populate: PopulateOption[] = [
      PopulatePatterns.ingredientsMinimal,
      PopulatePatterns.credentialMinimal,
      PopulatePatterns.userMinimal,
      PopulatePatterns.brandMinimal,
    ],
  ): Promise<PostDocument> {
    // Verify parent exists
    const parentPost = await this.findOne({ _id: parentId });
    if (!parentPost) {
      throw new Error(`Parent post with ID ${parentId} not found`);
    }

    // Find the root post of the thread (flat structure - all children point to root)
    const rootPost = await this.findRootPost(parentId);
    if (!rootPost) {
      throw new Error(
        `Could not find root post for thread starting from ${parentId}`,
      );
    }

    const rootPostId = rootPost._id.toString();

    // Order is based on total children of root, not the immediate parent
    const childrenCount = await this.model.countDocuments({
      isDeleted: false,
      parent: rootPostId,
    });

    const { parent, ...dtoWithoutParent } = dto;

    // Create reply with parent pointing to ROOT post
    const replyDto = {
      ...dtoWithoutParent,
      order: childrenCount + 1, // +1 because root post is order 0
      parent: new Types.ObjectId(rootPostId),
    };

    return this.create(replyDto, populate);
  }

  /**
   * Create a remix version of an existing post for A/B testing
   * Copies all properties except description (which is provided by user)
   * Stores reference to original post for KPI comparison
   */
  @HandleErrors('create remix post', 'posts')
  async createRemix(
    originalPostId: string,
    newDescription: string,
    dto: {
      user: Types.ObjectId;
      organization: Types.ObjectId;
      brand: Types.ObjectId;
      label?: string;
    },
    populate: PopulateOption[] = [
      PopulatePatterns.ingredientsMinimal,
      PopulatePatterns.credentialMinimal,
      PopulatePatterns.userMinimal,
      PopulatePatterns.brandMinimal,
    ],
  ): Promise<PostDocument> {
    // Find the original post
    const originalPost = await this.findOne({ _id: originalPostId }, populate);
    if (!originalPost) {
      throw new Error(`Original post with ID ${originalPostId} not found`);
    }

    // Extract ingredient IDs from populated data
    const ingredientIds = (
      originalPost.ingredients as unknown as ({ _id?: string } | string)[]
    )?.map((ing) => {
      if (typeof ing === 'object' && ing._id) {
        return new Types.ObjectId(ing._id);
      }
      return new Types.ObjectId(String(ing));
    });

    // Extract credential ID from populated data
    const populatedCredential = originalPost.credential as unknown as {
      _id?: string | Types.ObjectId;
    };
    const credentialId = populatedCredential?._id
      ? new Types.ObjectId(populatedCredential._id)
      : originalPost.credential instanceof Types.ObjectId
        ? originalPost.credential
        : new Types.ObjectId(String(originalPost.credential));

    // Create the remix post with copied data
    const remixDto = {
      brand: dto.brand,
      category: originalPost.category,
      credential: credentialId,
      description: newDescription,
      ingredients: ingredientIds || [],
      isAnalyticsEnabled: originalPost.isAnalyticsEnabled,
      isShareToFeedSelected: originalPost.isShareToFeedSelected,
      label: dto.label || `Remix: ${originalPost.label || 'Untitled'}`,
      organization: dto.organization,
      originalPost: new Types.ObjectId(originalPostId), // Link to original for KPI comparison
      platform: originalPost.platform,
      status: PostStatus.DRAFT, // Always start as draft for safety
      tags: originalPost.tags,
      timezone: originalPost.timezone || 'UTC',
      user: dto.user,
    };

    return this.create(
      remixDto as CreatePostDto & {
        user: Types.ObjectId;
        organization: Types.ObjectId;
        brand: Types.ObjectId;
        platform: CredentialPlatform;
      },
      populate,
    );
  }

  /**
   * Get all posts in a thread (from root to leaves).
   * Includes safeguards against excessive thread sizes.
   *
   * @param postId - Starting post ID
   * @param populate - Population options
   * @param maxPosts - Maximum posts to return (default: 500)
   * @returns Array of all posts in the thread
   */
  @HandleErrors('get full thread', 'posts')
  async getFullThread(
    postId: string,
    populate: PopulateOption[] = [
      PopulatePatterns.ingredientsMinimal,
      PopulatePatterns.credentialMinimal,
      PopulatePatterns.userMinimal,
      PopulatePatterns.brandMinimal,
    ],
    maxPosts: number = 500,
  ): Promise<PostDocument[]> {
    const post = await this.findOne({ _id: postId }, populate);
    if (!post) {
      return [];
    }

    // Use findRootPost which has cycle detection built in
    const rootPost = await this.findRootPost(postId, populate);
    if (!rootPost) {
      return [post]; // Return just the original post if root not found
    }

    // Get all descendants from root with safeguards
    const allPosts: PostDocument[] = [rootPost];
    const queue: PostDocument[] = [rootPost];
    const visited = new Set<string>();
    visited.add(rootPost._id.toString());

    while (queue.length > 0 && allPosts.length < maxPosts) {
      const current = queue.shift();
      if (!current) {
        continue;
      }

      const children = await this.model
        .find({ isDeleted: false, parent: current._id })
        .populate(populate as unknown as PopulateOption[])
        .sort({ order: 1 })
        .limit(maxPosts - allPosts.length) // Limit remaining capacity
        .exec();

      for (const child of children) {
        const childId = child._id.toString();
        // Skip if already visited (cycle detection)
        if (visited.has(childId)) {
          this.logger.warn('Cycle detected in thread traversal', {
            childId,
            parentId: current._id.toString(),
          });
          continue;
        }

        visited.add(childId);
        allPosts.push(child);
        queue.push(child);

        if (allPosts.length >= maxPosts) {
          this.logger.warn('Max posts limit reached in getFullThread', {
            limit: maxPosts,
            postId,
          });
          break;
        }
      }
    }

    return allPosts;
  }

  /**
   * Override remove to implement cascade soft deletion
   * When a parent post is deleted, all its children are also soft deleted
   */
  @HandleErrors('remove post with cascade', 'posts')
  async remove(id: string): Promise<PostDocument | null> {
    if (!id) {
      throw new Error('Post ID is required');
    }

    this.logger.log('Soft deleting post with cascade deletion', { id });

    // First, find the post to check if it exists and if it has children
    const post = await this.findOne({ _id: id });
    if (!post) {
      this.logger.warn(`Post ${id} not found for deletion`);
      return null;
    }

    const postId = new Types.ObjectId(id);

    // Soft delete all children posts (cascade deletion)
    const childrenUpdateResult = await this.model.updateMany(
      {
        isDeleted: false, // Only delete children that aren't already deleted
        parent: postId,
      },
      {
        $set: { isDeleted: true },
      },
    );

    if (childrenUpdateResult.modifiedCount > 0) {
      this.logger.log(
        `Cascade soft deleted ${childrenUpdateResult.modifiedCount} child posts`,
        {
          childrenDeleted: childrenUpdateResult.modifiedCount,
          parentId: id,
        },
      );
    }

    // Soft delete the parent post
    const result = await this.model
      .findByIdAndUpdate(id, { isDeleted: true }, { returnDocument: 'after' })
      .exec();

    if (result) {
      this.logger.log('Post soft deleted successfully', {
        childrenDeleted: childrenUpdateResult.modifiedCount,
        id,
      });

      // Invalidate cache
      if (this.cacheService) {
        const collectionName = this.collectionName;
        await this.cacheService.invalidateByTags([
          collectionName,
          `collection:${collectionName}`,
          `agg:${collectionName}`,
          'agg:paginated',
        ]);
      }
    } else {
      this.logger.warn(`Post ${id} not found for deletion`);
    }

    return result;
  }
}
