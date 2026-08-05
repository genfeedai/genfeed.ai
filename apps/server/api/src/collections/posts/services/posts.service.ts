import process from 'node:process';
import { CredentialEntity } from '@api/collections/credentials/entities/credential.entity';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { IngredientEntity } from '@api/collections/ingredients/entities/ingredient.entity';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { CreatePostDto } from '@api/collections/posts/dto/create-post.dto';
import { UpdatePostDto } from '@api/collections/posts/dto/update-post.dto';
import type { PostDocument } from '@api/collections/posts/schemas/post.schema';
import {
  batchSchedulePosts,
  type PostBatchScheduleItem,
  type PostBatchScheduleResult,
  type PostBatchScheduleTarget,
} from '@api/collections/posts/services/post-batch-schedule.util';
import { PublishApprovalsService } from '@api/collections/publish-approvals/services/publish-approvals.service';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { CacheService } from '@api/services/cache/services/cache.service';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { pickDefinedFields } from '@api/shared/utils/object/pick-defined-fields.util';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import { TimezoneUtil } from '@api/shared/utils/timezone/timezone.util';
import { CredentialPlatform, PostStatus } from '@genfeedai/enums';
import type {
  AgentContentMentionItem,
  PopulateOption,
} from '@genfeedai/interfaces';
import { scopedWhere } from '@genfeedai/server';
import type { IOnboardingJourneyMissionState } from '@genfeedai/types';
import { LoggerService } from '@libs/logger/logger.service';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import { BadRequestException, Injectable, Optional } from '@nestjs/common';

const ONBOARDING_JOURNEY_REWARD_EXPIRY_MS = 365 * 24 * 60 * 60 * 1000;
const DEFAULT_CONTENT_MENTION_LIMIT = 50;
const MAX_CONTENT_MENTION_LIMIT = 100;
const PUBLISH_APPROVAL_MATERIAL_FIELDS = new Set<string>([
  'category',
  'credentialId',
  'description',
  'ingredients',
  'isRepeat',
  'isShareToFeedSelected',
  'label',
  'maxRepeats',
  'parentId',
  'platform',
  'publishIntent',
  'repeatDaysOfWeek',
  'repeatEndDate',
  'repeatFrequency',
  'repeatInterval',
  'scheduledDate',
  'tags',
  'timezone',
]);

type ContentMentionPostRecord = {
  category: string;
  description: string;
  entityArticle: {
    coverImageUrl: string | null;
    title: string;
  } | null;
  entityIngredient: {
    cdnUrl: string | null;
    sampleAudioUrl: string | null;
  } | null;
  id: string;
  label: string | null;
};

type PostCreateInput = Omit<CreatePostDto, 'credentialId'> & {
  agentContextSource?: string;
  agentContextVersion?: number;
  agentRunId?: string;
  agentStrategyId?: string;
  agentThreadId?: string;
  brandId?: string;
  credentialId?: string;
  organizationId?: string;
  platform?: CredentialPlatform;
  promptUsed?: string;
  publishIntent?: string;
  reviewEvents?: Record<string, unknown>[];
  reviewFeedback?: string;
  sourceActionId?: string;
  sourceWorkflowId?: string;
  sourceWorkflowName?: string;
  userId?: string;
};

type PostUpdateInput = Partial<UpdatePostDto> & {
  brandId?: string;
  organizationId?: string;
  userId?: string;
};

const POST_SCALAR_FIELDS = [
  'agentContextSource',
  'agentContextVersion',
  'agentRunId',
  'agentStrategyId',
  'agentThreadId',
  'analyticsCollectedAt',
  'analyticsCollectionAttemptKey',
  'analyticsCollectionError',
  'analyticsCollectionRequestedAt',
  'analyticsCollectionState',
  'brandId',
  'category',
  'contentRunId',
  'credentialId',
  'creativeVersion',
  'description',
  'entityArticleId',
  'entityIngredientId',
  'entityModel',
  'externalId',
  'externalShortcode',
  'generationId',
  'groupId',
  'hookVersion',
  'isAnalyticsEnabled',
  'isDeleted',
  'isRepeat',
  'isShareToFeedSelected',
  'label',
  'lastAttemptAt',
  'maxRepeats',
  'nextScheduledDate',
  'order',
  'originalPostId',
  'organizationId',
  'parentId',
  'personaId',
  'platform',
  'promptUsed',
  'publicationDate',
  'publishedAt',
  'publishApprovalId',
  'publishIntent',
  'quoteTweetId',
  'repeatCount',
  'repeatDaysOfWeek',
  'repeatEndDate',
  'repeatFrequency',
  'repeatInterval',
  'reviewFeedback',
  'reviewBatchId',
  'reviewDecision',
  'reviewEvents',
  'reviewItemId',
  'reviewVersionPinId',
  'reviewedAt',
  'retryCount',
  'scheduleSlot',
  'scheduledDate',
  'seoBreakdown',
  'seoScore',
  'source',
  'sourceActionId',
  'sourceWorkflowId',
  'sourceWorkflowName',
  'status',
  'targetAttachments',
  'targetError',
  'targetExecutionState',
  'targetIdempotencyKey',
  'targetReadiness',
  'targetSettings',
  'targetValidationIssues',
  'targetValidationState',
  'timezone',
  'uploadedAt',
  'url',
  'userId',
  'variantId',
  'workflowExecutionId',
] as const;

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
    @Optional()
    private readonly publishApprovalsService?: PublishApprovalsService,
  ) {
    super(prisma, 'post', logger, undefined, cacheService);
  }

  create(
    dto: PostCreateInput,
    populate: PopulateOption[] = [
      PopulatePatterns.ingredientsMinimal,
      PopulatePatterns.credentialMinimal,
      PopulatePatterns.userMinimal,
      PopulatePatterns.brandMinimal,
    ],
  ): Promise<PostDocument> {
    const dtoRecord = dto as unknown as Record<string, unknown>;
    const {
      campaign: _campaign,
      ingredients,
      tags,
      threadPosts: _threadPosts,
    } = dto;

    const prismaWriteData: Record<string, unknown> = {
      ...pickDefinedFields(dtoRecord, POST_SCALAR_FIELDS),
      ...(ingredients !== undefined && {
        ingredients: {
          connect: ingredients.map((id) => ({ id })),
        },
      }),
      ...(tags !== undefined && {
        tags: { connect: tags.map((id) => ({ id })) },
      }),
    };

    this.assertPublishTarget(dto.status, dto.credentialId, dto.platform);

    // Convert scheduledDate from user timezone to UTC if timezone is provided
    if (dto.scheduledDate && dto.timezone) {
      const convertedDate = TimezoneUtil.convertToUTC(
        new Date(dto.scheduledDate),
        dto.timezone,
      );

      this.logger.log(
        `Converting scheduledDate from ${dto.timezone} to UTC: ${dto.scheduledDate} → ${convertedDate.toISOString()}`,
      );

      prismaWriteData.scheduledDate = convertedDate;
    }

    return super.create(prismaWriteData as unknown as CreatePostDto, populate);
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
    _populate: PopulateOption[] = [
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
      where: scopedWhere(orgId, { id: { in: stringIds } }),
    });

    this.logger.debug('findByIds success', {
      found: results.length,
      requested: ids.length,
    });

    return results as unknown as PostDocument[];
  }

  async listContentMentions(
    organizationId: string,
    limit: number = DEFAULT_CONTENT_MENTION_LIMIT,
  ): Promise<AgentContentMentionItem[]> {
    if (!organizationId) {
      return [];
    }

    const safeLimit = Math.min(Math.max(limit, 1), MAX_CONTENT_MENTION_LIMIT);
    const posts = (await this.prisma.post.findMany({
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      select: {
        category: true,
        description: true,
        entityArticle: {
          select: {
            coverImageUrl: true,
            title: true,
          },
        },
        entityIngredient: {
          select: {
            cdnUrl: true,
            sampleAudioUrl: true,
          },
        },
        id: true,
        label: true,
      },
      take: safeLimit,
      where: scopedWhere(organizationId, {}),
    })) as unknown as ContentMentionPostRecord[];

    return posts.map((post) => ({
      contentTitle: this.formatContentMentionTitle(post),
      contentType: String(post.category).toLowerCase(),
      id: post.id,
      thumbnailUrl:
        post.entityArticle?.coverImageUrl ??
        post.entityIngredient?.cdnUrl ??
        post.entityIngredient?.sampleAudioUrl ??
        undefined,
    }));
  }

  private formatContentMentionTitle(post: ContentMentionPostRecord): string {
    const title =
      post.label?.trim() ||
      post.entityArticle?.title.trim() ||
      post.description.trim();

    if (title.length <= 80) {
      return title;
    }

    return `${title.slice(0, 77)}...`;
  }

  async patch(
    id: string,
    dto: PostUpdateInput,
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
    const changesApprovalScope = Object.keys(dto).some((key) =>
      PUBLISH_APPROVAL_MATERIAL_FIELDS.has(key),
    );
    const approvalContext = changesApprovalScope
      ? await this.prisma.post.findFirst({
          select: { organizationId: true, publishApprovalId: true },
          where: { id, isDeleted: false },
        })
      : null;
    if (approvalContext?.publishApprovalId && this.publishApprovalsService) {
      await this.publishApprovalsService.assertPostMutable(
        approvalContext.organizationId,
        id,
      );
    }

    let resolvedPlatform: string | undefined;
    if (dto.credentialId && approvalContext) {
      const credential = await this.prisma.credential.findFirst({
        select: { platform: true },
        where: {
          id: dto.credentialId,
          isConnected: true,
          isDeleted: false,
          organizationId: approvalContext.organizationId,
        },
      });
      if (!credential) {
        throw new BadRequestException(
          'The selected publishing credential is unavailable for this organization.',
        );
      }
      resolvedPlatform = credential.platform;
    }

    let currentPost: PostDocument | null = null;

    if (normalizedStatus === PostStatus.SCHEDULED || isPublishingPost) {
      currentPost = await this.findOne({ id: id });
      if (currentPost) {
        const targetCredentialId = dto.credentialId ?? currentPost.credentialId;
        const targetPlatform = resolvedPlatform ?? currentPost.platform;
        this.assertPublishTarget(
          normalizedStatus,
          targetCredentialId,
          targetPlatform,
        );
      }
    }

    const { ingredients, tags } = dto;
    const dtoRecord = dto as unknown as Record<string, unknown>;

    const prismaWriteData: Record<string, unknown> = {
      ...pickDefinedFields(dtoRecord, POST_SCALAR_FIELDS),
      ...(resolvedPlatform !== undefined && { platform: resolvedPlatform }),
      ...(ingredients !== undefined && {
        ingredients: { set: ingredients.map((id) => ({ id })) },
      }),
      ...(tags !== undefined && {
        tags: { set: tags.map((id) => ({ id })) },
      }),
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

      prismaWriteData.scheduledDate = convertedDate;
    }

    // If parent post is being scheduled, automatically schedule all children
    if (normalizedStatus === PostStatus.SCHEDULED) {
      if (currentPost && !currentPost.parentId) {
        // Find all children and update them to SCHEDULED
        const updateResult = await this.prisma.post.updateMany({
          data: {
            credentialId: dto.credentialId ?? currentPost.credentialId,
            platform: resolvedPlatform ?? currentPost.platform,
            status: PostStatus.SCHEDULED,
            ...(prismaWriteData.scheduledDate
              ? { scheduledDate: prismaWriteData.scheduledDate as Date }
              : {}),
          } as never,
          where: {
            isDeleted: false,
            parentId: id,
            status: { not: PostStatus.PUBLIC },
          },
        });

        this.logger.log(`Auto-scheduled children for parent post ${id}`, {
          childrenUpdated: updateResult.count,
          parentId: id,
          status: PostStatus.SCHEDULED,
        });
      }
    }

    const updatedPost = await super.patch(
      id,
      prismaWriteData as unknown as UpdatePostDto,
      populate,
    );

    if (approvalContext?.publishApprovalId && this.publishApprovalsService) {
      await this.publishApprovalsService.invalidatePost(
        approvalContext.organizationId,
        id,
        'Canonical Post material or protected schedule intent changed.',
      );
    }

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

  private assertPublishTarget(
    status: string | undefined,
    credentialId: string | null | undefined,
    platform: string | null | undefined,
  ): void {
    const normalizedStatus = status?.toLowerCase();
    if (
      normalizedStatus !== PostStatus.SCHEDULED &&
      normalizedStatus !== PostStatus.PUBLIC
    ) {
      return;
    }

    if (!credentialId || !platform) {
      throw new BadRequestException(
        'A credential and platform are required before scheduling or publishing a post.',
      );
    }
  }

  /**
   * Schedule a batch of posts in a fixed number of round-trips instead of the
   * 2N–4N serial queries a `patch` per item used to cost. The planning and
   * write orchestration live in `post-batch-schedule.util`; this only hands it
   * the service collaborators it needs.
   */
  async batchSchedule(
    items: readonly PostBatchScheduleItem[],
    organizationId: string,
    target: PostBatchScheduleTarget,
  ): Promise<PostBatchScheduleResult> {
    return batchSchedulePosts(
      {
        cacheService: this.cacheService,
        cacheTags: [
          this.collectionName,
          `collection:${this.collectionName}`,
          `agg:${this.collectionName}`,
          'agg:paginated',
        ],
        logger: this.logger,
        normalizeData: (data) =>
          this.normalizeData(data) as Record<string, unknown>,
        normalizeDocument: (document) => this.normalizeDocument(document),
        prisma: this.prisma,
        publishApprovalsService: this.publishApprovalsService,
      },
      items,
      organizationId,
      target,
    );
  }

  private async completePublishFirstPostMission(
    post: Pick<PostDocument, 'organizationId'>,
  ): Promise<void> {
    if (!this.organizationSettingsService || !this.creditsUtilsService) {
      return;
    }

    const organizationId = post.organizationId;
    if (!organizationId) {
      return;
    }

    const settings = await this.organizationSettingsService.findOne({
      organizationId: organizationId,
    });

    if (!settings?.id) {
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

    await this.organizationSettingsService.patch(String(settings.id), {
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
      (post.id as string | undefined) ?? (post as unknown as { id: string }).id,
    );

    await this.patch(postId, {
      status: PostStatus.PROCESSING,
    });

    try {
      const brandId = post.brandId;
      const organizationId = post.organizationId;
      const userId = post.userId;
      const authProviderUserId = userId;

      await this.fileQueueService?.uploadYoutube({
        brandId,
        authProviderUserId,
        credentialId: credential.id.toString(),
        description: post.description || '',
        ingredientId: ingredient.id.toString(),
        organizationId,
        postId,
        room: authProviderUserId
          ? getUserRoomName(authProviderUserId)
          : undefined,
        scheduledDate: post.scheduledDate ?? undefined,
        status: originalStatus,
        tags:
          (post.tags as unknown as ({ name?: string } | string)[])?.map(
            (tag) =>
              typeof tag === 'object' && tag?.name ? tag.name : String(tag),
          ) || [],
        title: post.label || 'Untitled',
        userId,
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
    threadPosts: PostCreateInput[],
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
    const { parentId: _rootParentId, ...rootPostWithoutParent } =
      threadPosts[0];
    const rootPostDto = {
      ...rootPostWithoutParent,
      order: 0,
      parentId: undefined,
    };

    const rootPost = await this.create(rootPostDto, populate);
    createdPosts.push(rootPost);
    const rootPostId = rootPost.id;

    for (let i = 1; i < threadPosts.length; i++) {
      const { parentId: _parentId, ...postWithoutParent } = threadPosts[i];

      const postDto = {
        ...postWithoutParent,
        order: i,
        parentId: rootPostId,
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
    _populate: PopulateOption[] = [
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
    const requestedMaxDepth = Number.isFinite(maxDepth)
      ? Math.trunc(maxDepth)
      : 100;
    const safeMaxDepth = Math.min(Math.max(requestedMaxDepth, 1), 500);
    const ancestors = await this.prisma.$queryRaw<
      Array<{ depth: number; id: string; parentId: string | null }>
    >`
      WITH RECURSIVE ancestors AS (
        SELECT id, "parentId", 1 AS depth
        FROM "posts"
        WHERE id = ${postId} AND "isDeleted" = false
        UNION ALL
        SELECT p.id, p."parentId", a.depth + 1
        FROM "posts" p
        INNER JOIN ancestors a ON p.id = a."parentId"
        WHERE p."isDeleted" = false AND a.depth <= ${safeMaxDepth}
      )
      SELECT id, "parentId", depth FROM ancestors
      ORDER BY depth ASC
      LIMIT ${safeMaxDepth + 1}
    `;

    if (!ancestors || ancestors.length === 0) {
      return null;
    }

    if (ancestors.length > safeMaxDepth) {
      this.logger.error('Max depth exceeded in findRootPost', {
        depth: ancestors.length,
        maxDepth: safeMaxDepth,
        postId,
      });
      throw new BadRequestException(
        `Max hierarchy depth (${safeMaxDepth}) exceeded for post ${postId}`,
      );
    }

    const rootRow = ancestors.find((a) => a.parentId === null);
    if (!rootRow) {
      return this.findOne({ id: postId }, populate);
    }

    return this.findOne({ id: rootRow.id }, populate);
  }

  /**
   * Add a reply to an existing post (thread reply)
   */
  @HandleErrors('add thread reply', 'posts')
  async addThreadReply(
    parentId: string,
    dto: PostCreateInput,
    populate: PopulateOption[] = [
      PopulatePatterns.ingredientsMinimal,
      PopulatePatterns.credentialMinimal,
      PopulatePatterns.userMinimal,
      PopulatePatterns.brandMinimal,
    ],
  ): Promise<PostDocument> {
    const parentPost = await this.findOne({ id: parentId });
    if (!parentPost) {
      throw new Error(`Parent post with ID ${parentId} not found`);
    }

    const rootPost = await this.findRootPost(parentId);
    if (!rootPost) {
      throw new Error(
        `Could not find root post for thread starting from ${parentId}`,
      );
    }

    const rootPostId = rootPost.id.toString();

    const childrenCount = await this.prisma.post.count({
      where: { isDeleted: false, parentId: rootPostId },
    });

    const { parentId: _parentId, ...dtoWithoutParent } = dto;

    const replyDto = {
      ...dtoWithoutParent,
      order: childrenCount + 1,
      parentId: rootPostId,
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
      brandId: string;
      label?: string;
      organizationId: string;
      userId: string;
    },
    populate: PopulateOption[] = [
      PopulatePatterns.ingredientsMinimal,
      PopulatePatterns.credentialMinimal,
      PopulatePatterns.userMinimal,
      PopulatePatterns.brandMinimal,
    ],
  ): Promise<PostDocument> {
    const originalPost = await this.findOne({ id: originalPostId }, populate);
    if (!originalPost) {
      throw new Error(`Original post with ID ${originalPostId} not found`);
    }

    const ingredientIds = (
      originalPost.ingredients as unknown as ({ id?: string } | string)[]
    )?.map((ing) => {
      if (typeof ing === 'object' && ing.id) {
        return ing.id;
      }
      return String(ing);
    });

    const credentialId = originalPost.credentialId ?? undefined;
    const tagIds = Array.isArray(originalPost.tags)
      ? originalPost.tags.flatMap((tag) => {
          if (typeof tag === 'string') {
            return [tag];
          }
          if (
            tag &&
            typeof tag === 'object' &&
            typeof (tag as { id?: unknown }).id === 'string'
          ) {
            return [(tag as { id: string }).id];
          }
          return [];
        })
      : undefined;

    const remixDto = {
      brandId: dto.brandId,
      category: originalPost.category as PostCreateInput['category'],
      credentialId,
      description: newDescription,
      ingredients: ingredientIds || [],
      isAnalyticsEnabled: originalPost.isAnalyticsEnabled,
      isShareToFeedSelected: originalPost.isShareToFeedSelected,
      label: dto.label || `Remix: ${originalPost.label || 'Untitled'}`,
      organizationId: dto.organizationId,
      originalPostId,
      platform: parsePlatform(originalPost.platform) ?? undefined,
      status: PostStatus.DRAFT,
      tags: tagIds,
      timezone: originalPost.timezone || 'UTC',
      userId: dto.userId,
    } satisfies PostCreateInput;

    return this.create(remixDto, populate);
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
    const post = await this.findOne({ id: postId }, populate);
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
    visited.add(rootPost.id.toString());

    while (queue.length > 0 && allPosts.length < maxPosts) {
      const current = queue.shift();
      if (!current) {
        continue;
      }

      const currentId = String(
        (current.id as string | undefined) ??
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

    const post = await this.findOne({ id: id });
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
