import process from 'node:process';
import { CredentialEntity } from '@api/collections/credentials/entities/credential.entity';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { IngredientEntity } from '@api/collections/ingredients/entities/ingredient.entity';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { CreatePostDto } from '@api/collections/posts/dto/create-post.dto';
import { UpdatePostDto } from '@api/collections/posts/dto/update-post.dto';
import type { PostDocument } from '@api/collections/posts/schemas/post.schema';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { ObjectIdUtil } from '@api/helpers/utils/objectid/objectid.util';
import { CacheService } from '@api/services/cache/services/cache.service';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import { TimezoneUtil } from '@api/shared/utils/timezone/timezone.util';
import { CredentialPlatform, PostStatus } from '@genfeedai/enums';
import type { PopulateOption } from '@genfeedai/interfaces';
import type { IOnboardingJourneyMissionState } from '@genfeedai/types';
import { LoggerService } from '@libs/logger/logger.service';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import { BadRequestException, Injectable, Optional } from '@nestjs/common';

const ONBOARDING_JOURNEY_REWARD_EXPIRY_MS = 365 * 24 * 60 * 60 * 1000;
const PRISMA_POST_STATUS = {
  PUBLIC: 'PUBLIC',
  SCHEDULED: 'SCHEDULED',
} as const;

@Injectable()
export class PostsService extends BaseService<
  PostDocument,
  CreatePostDto,
  UpdatePostDto
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
    @Optional() public readonly cacheService?: CacheService,
    @Optional() private readonly fileQueueService?: FileQueueService,
    @Optional()
    private readonly organizationSettingsService?: OrganizationSettingsService,
    @Optional() private readonly creditsUtilsService?: CreditsUtilsService,
  ) {
    super(prisma, 'post', logger, undefined, cacheService);
  }

  create(
    dto: CreatePostDto & {
      user: string;
      organization: string;
      brand: string;
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
            dto.ingredients as unknown as Array<string>,
          )
        : undefined;
    const normalizedCredential = ObjectIdUtil.normalizeToObjectId(
      dto.credential as unknown as string,
    );
    const normalizedParent = ObjectIdUtil.normalizeToObjectId(
      dto.parent as unknown as string | undefined,
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
   */
  async findByIds(
    ids: string[],
    organizationId: string,
    populate: PopulateOption[] = [
      PopulatePatterns.ingredientsMinimal,
      PopulatePatterns.credentialMinimal,
    ],
  ): Promise<PostDocument[]> {
    if (!ids || ids.length === 0) {
      return [];
    }

    const stringIds = ids.map((id) => String(id));
    const orgId = String(organizationId);

    this.logger.debug('findByIds', {
      count: ids.length,
      organizationId: orgId,
    });

    const results = await this.prisma.post.findMany({
      where: {
        id: { in: stringIds },
        isDeleted: false,
        organizationId: orgId,
      },
    });

    this.logger.debug('findByIds success', {
      found: results.length,
      requested: ids.length,
    });

    return results as unknown as PostDocument[];
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
    const normalizedStatus =
      typeof dto.status === 'string' ? dto.status.toLowerCase() : undefined;
    const isPublishingPost = normalizedStatus === PostStatus.PUBLIC;
    let currentPost: PostDocument | null = null;

    if (normalizedStatus === PostStatus.SCHEDULED || isPublishingPost) {
      currentPost = await this.findOne({ _id: id });
    }

    // Normalize ObjectId fields — DTO fields are Types.ObjectId but may arrive as strings at runtime
    const normalizedIngredients =
      dto.ingredients !== undefined
        ? (ObjectIdUtil.normalizeArrayToObjectIds(
            dto.ingredients as unknown as Array<string>,
          ) ?? [])
        : undefined;
    const normalizedCredential = ObjectIdUtil.normalizeToObjectId(
      dto.credential as unknown as string | undefined,
    );
    const normalizedParent =
      dto.parent !== undefined
        ? ObjectIdUtil.normalizeToObjectId(dto.parent as unknown as string)
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
    if (normalizedStatus === PostStatus.SCHEDULED) {
      if (currentPost && !currentPost.parent) {
        // Find all children and update them to SCHEDULED
        const updateResult = await this.prisma.post.updateMany({
          data: {
            status: PRISMA_POST_STATUS.SCHEDULED,
            ...(normalizedDto.scheduledDate && {
              scheduledDate: normalizedDto.scheduledDate as Date,
            }),
          } as never,
          where: {
            isDeleted: false,
            parentId: id,
            status: { not: PRISMA_POST_STATUS.PUBLIC },
          },
        });

        this.logger.log(`Auto-scheduled children for parent post ${id}`, {
          childrenUpdated: updateResult.count,
          parentId: id,
          status: PostStatus.SCHEDULED,
        });
      }
    }

    const updatedPost = await super.patch(id, normalizedDto, populate);

    if (
      isPublishingPost &&
      updatedPost &&
      String(updatedPost.status).toLowerCase() === PostStatus.PUBLIC &&
      String(currentPost?.status ?? '').toLowerCase() !== PostStatus.PUBLIC
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
      organization: organizationId,
    });

    if (!settings?._id) {
      return;
    }

    const missions = this.organizationSettingsService.normalizeJourneyState(
      settings.onboardingJourneyMissions as unknown as
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
   */
  @HandleErrors('handle YouTube post', 'posts')
  async handleYoutubePost(post: PostDocument): Promise<void> {
    const ingredients = Array.isArray(post.ingredients) ? post.ingredients : [];

    if (!post.credential || ingredients.length === 0) {
      throw new Error('Post must have credential and at least one ingredient');
    }

    const credential = post.credential as unknown as CredentialEntity;
    const ingredient = ingredients[0] as unknown as IngredientEntity;

    if (credential.platform !== 'YOUTUBE') {
      this.logger.warn(
        `handleYoutubePost called for non-YouTube platform: ${credential.platform}`,
      );
      return;
    }

    // Save original status before changing to PROCESSING
    const originalStatus = post.status;
    const postId: string = String(
      (post._id as string | undefined) ??
        (post as unknown as { id: string }).id,
    );

    await this.patch(postId, {
      status: PostStatus.PROCESSING,
    });

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
        room: clerkUserId ? getUserRoomName(clerkUserId) : undefined,
        scheduledDate: post.scheduledDate ?? undefined,
        status: originalStatus,
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

      await this.patch(postId, {
        status: PostStatus.FAILED,
      });

      throw error;
    }
  }

  /**
   * Count posts matching filter
   */
  async count(filter: Record<string, unknown>): Promise<number> {
    return this.prisma.post.count({ where: filter as never });
  }

  /**
   * Create a thread (batch of posts with parent-child relationships)
   */
  @HandleErrors('create thread', 'posts')
  async createThread(
    threadPosts: Array<
      CreatePostDto & {
        user: string;
        organization: string;
        brand: string;
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
      parent: undefined,
    };

    const rootPost = await this.create(rootPostDto, populate);
    createdPosts.push(rootPost);
    const rootPostId = rootPost._id;

    for (let i = 1; i < threadPosts.length; i++) {
      const { parent: _parent, ...postWithoutParent } = threadPosts[i];

      const postDto = {
        ...postWithoutParent,
        order: i,
        parent: rootPostId,
      };

      const createdPost = await this.create(postDto, populate);
      createdPosts.push(createdPost);
    }

    return createdPosts;
  }

  /**
   * Get all children of a post.
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
    const safeLimit = Math.min(limit, 500);

    const children = await this.prisma.post.findMany({
      orderBy: { order: 'asc' },
      take: safeLimit,
      where: { isDeleted: false, parentId },
    });

    return children as unknown as PostDocument[];
  }

  /**
   * Find the root post of a thread.
   *
   * Uses a single recursive CTE to traverse the full parent chain in one
   * database round-trip, eliminating the N+1 query from the previous
   * while-loop implementation.
   */
  @HandleErrors('find root post', 'posts')
  async findRootPost(
    postId: string,
    populate: PopulateOption[] = [],
    maxDepth: number = 100,
  ): Promise<PostDocument | null> {
    const ancestors = await this.prisma.$queryRaw<
      Array<{ id: string; parentId: string | null }>
    >`
      WITH RECURSIVE ancestors AS (
        SELECT id, "parentId"
        FROM "Post"
        WHERE id = ${postId} AND "isDeleted" = false
        UNION ALL
        SELECT p.id, p."parentId"
        FROM "Post" p
        INNER JOIN ancestors a ON p.id = a."parentId"
        WHERE p."isDeleted" = false
      )
      SELECT id, "parentId" FROM ancestors
      LIMIT ${maxDepth + 1}
    `;

    if (!ancestors || ancestors.length === 0) {
      return null;
    }

    if (ancestors.length > maxDepth) {
      this.logger.error('Max depth exceeded in findRootPost', {
        depth: ancestors.length,
        maxDepth,
        postId,
      });
      throw new BadRequestException(
        `Max hierarchy depth (${maxDepth}) exceeded for post ${postId}`,
      );
    }

    const rootRow = ancestors.find((a) => a.parentId === null);
    if (!rootRow) {
      return this.findOne({ _id: postId }, populate);
    }

    return this.findOne({ _id: rootRow.id }, populate);
  }

  /**
   * Add a reply to an existing post (thread reply)
   */
  @HandleErrors('add thread reply', 'posts')
  async addThreadReply(
    parentId: string,
    dto: CreatePostDto & {
      user: string;
      organization: string;
      brand: string;
      platform: CredentialPlatform;
    },
    populate: PopulateOption[] = [
      PopulatePatterns.ingredientsMinimal,
      PopulatePatterns.credentialMinimal,
      PopulatePatterns.userMinimal,
      PopulatePatterns.brandMinimal,
    ],
  ): Promise<PostDocument> {
    const parentPost = await this.findOne({ _id: parentId });
    if (!parentPost) {
      throw new Error(`Parent post with ID ${parentId} not found`);
    }

    const rootPost = await this.findRootPost(parentId);
    if (!rootPost) {
      throw new Error(
        `Could not find root post for thread starting from ${parentId}`,
      );
    }

    const rootPostId = rootPost._id.toString();

    const childrenCount = await this.prisma.post.count({
      where: { isDeleted: false, parentId: rootPostId },
    });

    const { parent, ...dtoWithoutParent } = dto;

    const replyDto = {
      ...dtoWithoutParent,
      order: childrenCount + 1,
      parent: rootPostId,
    };

    return this.create(replyDto, populate);
  }

  /**
   * Create a remix version of an existing post for A/B testing
   */
  @HandleErrors('create remix post', 'posts')
  async createRemix(
    originalPostId: string,
    newDescription: string,
    dto: {
      user: string;
      organization: string;
      brand: string;
      label?: string;
    },
    populate: PopulateOption[] = [
      PopulatePatterns.ingredientsMinimal,
      PopulatePatterns.credentialMinimal,
      PopulatePatterns.userMinimal,
      PopulatePatterns.brandMinimal,
    ],
  ): Promise<PostDocument> {
    const originalPost = await this.findOne({ _id: originalPostId }, populate);
    if (!originalPost) {
      throw new Error(`Original post with ID ${originalPostId} not found`);
    }

    const ingredientIds = (
      originalPost.ingredients as unknown as ({ _id?: string } | string)[]
    )?.map((ing) => {
      if (typeof ing === 'object' && ing._id) {
        return ing._id;
      }
      return String(ing);
    });

    const populatedCredential = originalPost.credential as unknown as {
      _id?: string;
    };
    const credentialId = populatedCredential?._id
      ? populatedCredential._id
      : originalPost.credential === '__never__'
        ? originalPost.credential
        : String(originalPost.credential);

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
      originalPost: originalPostId,
      platform: originalPost.platform,
      status: PostStatus.DRAFT,
      tags: originalPost.tags,
      timezone: originalPost.timezone || 'UTC',
      user: dto.user,
    };

    return this.create(
      remixDto as unknown as CreatePostDto & {
        user: string;
        organization: string;
        brand: string;
        platform: CredentialPlatform;
      },
      populate,
    );
  }

  /**
   * Get all posts in a thread (from root to leaves).
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

    const rootPost = await this.findRootPost(postId, populate);
    if (!rootPost) {
      return [post];
    }

    const allPosts: PostDocument[] = [rootPost];
    const queue: PostDocument[] = [rootPost];
    const visited = new Set<string>();
    visited.add(rootPost._id.toString());

    while (queue.length > 0 && allPosts.length < maxPosts) {
      const current = queue.shift();
      if (!current) {
        continue;
      }

      const currentId = String(
        (current._id as string | undefined) ??
          (current as unknown as { id: string }).id,
      );

      const children = await this.prisma.post.findMany({
        orderBy: { order: 'asc' },
        take: maxPosts - allPosts.length,
        where: { isDeleted: false, parentId: currentId },
      });

      for (const child of children) {
        const childId = String(child.id);
        if (visited.has(childId)) {
          this.logger.warn('Cycle detected in thread traversal', {
            childId,
            parentId: currentId,
          });
          continue;
        }

        visited.add(childId);
        allPosts.push(child as unknown as PostDocument);
        queue.push(child as unknown as PostDocument);

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
   */
  @HandleErrors('remove post with cascade', 'posts')
  async remove(id: string): Promise<PostDocument | null> {
    if (!id) {
      throw new Error('Post ID is required');
    }

    this.logger.log('Soft deleting post with cascade deletion', { id });

    const post = await this.findOne({ _id: id });
    if (!post) {
      this.logger.warn(`Post ${id} not found for deletion`);
      return null;
    }

    // Cascade soft delete all children
    const childrenUpdateResult = await this.prisma.post.updateMany({
      data: { isDeleted: true } as never,
      where: { isDeleted: false, parentId: id },
    });

    if (childrenUpdateResult.count > 0) {
      this.logger.log(
        `Cascade soft deleted ${childrenUpdateResult.count} child posts`,
        {
          childrenDeleted: childrenUpdateResult.count,
          parentId: id,
        },
      );
    }

    // Soft delete the parent post
    const result = await this.prisma.post.update({
      data: { isDeleted: true } as never,
      where: { id },
    });

    if (result) {
      this.logger.log('Post soft deleted successfully', {
        childrenDeleted: childrenUpdateResult.count,
        id,
      });

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

    return result as unknown as PostDocument | null;
  }
}
