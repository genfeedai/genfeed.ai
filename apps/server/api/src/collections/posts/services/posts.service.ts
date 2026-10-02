import process from 'node:process';
import { CredentialEntity } from '@api/collections/credentials/entities/credential.entity';
import { OnboardingCreditGrantsService } from '@api/collections/credits/services/onboarding-credit-grants.service';
import { IngredientEntity } from '@api/collections/ingredients/entities/ingredient.entity';
import { CreatePostDto } from '@api/collections/posts/dto/create-post.dto';
import { UpdatePostDto } from '@api/collections/posts/dto/update-post.dto';
import type { PostDocument } from '@api/collections/posts/post.schema';
import {
  assertPublishTarget,
  assertValidChannelTargetSchedule,
  assertVisibilitySupported,
} from '@api/collections/posts/services/channel-target-schedule-validation.util';
import {
  batchSchedulePosts,
  type PostBatchScheduleItem,
  type PostBatchScheduleResult,
  type PostBatchScheduleTarget,
} from '@api/collections/posts/services/post-batch-schedule.util';
import {
  createPostChildWithLearning,
  type PostLearningMutationContext,
  patchPostWithLearning,
  removePostWithLearning,
} from '@api/collections/posts/services/post-learning-mutation.util';
import { POST_SCALAR_FIELDS } from '@api/collections/posts/services/post-patch-write.util';
import {
  extensionPublicationAnalyticsAvailability,
  extensionPublicationAnalyticsError,
  extensionPublicationCaptureResult,
  isExtensionPublicationCapture,
  normalizeExtensionPublication,
  parseExtensionPublicationCaptureInput,
  resolveExtensionPublicationObservedVisibility,
} from '@api/collections/posts/services/post-publication-capture.util';
import { bindScheduledPublishApproval } from '@api/collections/posts/services/post-schedule-approval.util';
import { ScheduledPostWorkflowQueueService } from '@api/collections/posts/services/scheduled-post-workflow-queue.service';
import { PublishApprovalsService } from '@api/collections/publish-approvals/services/publish-approvals.service';
import { ValidationException } from '@api/exceptions/validation.exception';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { scopedWhere } from '@api/index';
import { CacheService } from '@api/services/cache/cache.service';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  BaseService,
  type PopulateInput,
} from '@api/shared/services/base/base.service';
import { pickDefinedFields } from '@api/shared/utils/object/pick-defined-fields.util';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import { paginatedQueryCacheTag } from '@api/shared/utils/query-cache/query-cache.util';
import { TimezoneUtil } from '@api/shared/utils/timezone/timezone.util';
import {
  CredentialPlatform,
  fromPrismaCredentialPlatform,
  type PersistedReviewDecision,
  PostFormat,
  PostVisibility,
  parsePlatform,
  TargetExecutionState,
  type TargetValidationState,
  toPrismaCredentialPlatform,
} from '@genfeedai/contracts';
import {
  projectLegacyPostStatus,
  resolveDefaultTargetExecutionState,
  resolvePostVisibility,
} from '@genfeedai/contracts/api-types/contracts/scheduler.contract';
import type {
  AgentContentMentionItem,
  KnowledgeReceipt,
  PopulateOption,
} from '@genfeedai/contracts/interfaces';
import type {
  ExtensionPublicationCaptureInput,
  ExtensionPublicationCaptureResult,
  ExtensionPublicationCaptureScope,
} from '@genfeedai/contracts/interfaces/content/extension-publication.interface';
import { PostCategory, Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Optional,
} from '@nestjs/common';

const DEFAULT_CONTENT_MENTION_LIMIT = 50;
const MAX_CONTENT_MENTION_LIMIT = 100;

type ContentMentionPostRecord = {
  brandId: string | null;
  category: string;
  description: string;
  entityArticle: {
    coverImageUrl: string | null;
    label: string;
  } | null;
  entityIngredient: {
    cdnUrl: string | null;
    sampleAudioUrl: string | null;
  } | null;
  id: string;
  label: string | null;
};

export type PostCreateInput = Omit<CreatePostDto, 'credentialId'> & {
  agentContextSource?: string;
  agentContextVersion?: number;
  workflowExecutionId?: string;
  agentStrategyId?: string;
  agentThreadId?: string;
  brandId?: string;
  credentialId?: string | null;
  organizationId?: string;
  originalPostId?: string;
  platform?: CredentialPlatform;
  knowledgeReceipts?: KnowledgeReceipt[];
  promptUsed?: string;
  publishIntent?: string;
  reviewEvents?: Record<string, unknown>[];
  reviewFeedback?: string;
  sourceActionId?: string;
  sourceWorkflowId?: string;
  sourceWorkflowName?: string;
  targetAttachments?: Prisma.InputJsonValue;
  targetExecutionState?: TargetExecutionState;
  targetIdempotencyKey?: string;
  targetSettings?: Prisma.InputJsonValue;
  targetValidationIssues?: string[];
  targetValidationState?: TargetValidationState;
  userId?: string;
};

export type PostUpdateInput = Partial<UpdatePostDto> & {
  agentStrategyId?: string;
  brandId?: string;
  organizationId?: string;
  platform?: CredentialPlatform;
  reviewDecision?: PersistedReviewDecision;
  reviewFeedback?: string;
  reviewedAt?: Date;
  targetSettings?: Prisma.InputJsonValue;
  userId?: string;
};

@Injectable()
export class PostsService extends BaseService<
  PostDocument,
  CreatePostDto,
  UpdatePostDto
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
    private readonly onboardingCreditGrantsService: OnboardingCreditGrantsService,
    @Optional() public readonly cacheService?: CacheService,
    @Optional() private readonly fileQueueService?: FileQueueService,
    @Optional()
    private readonly publishApprovalsService?: PublishApprovalsService,
    @Optional()
    private readonly scheduledPostWorkflowQueue?: ScheduledPostWorkflowQueueService,
  ) {
    super(prisma, 'post', logger, undefined, cacheService);
  }

  async create(
    dto: PostCreateInput,
    populate: PopulateInput = [
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

    const isChild =
      typeof prismaWriteData.parentId === 'string' &&
      prismaWriteData.parentId.length > 0;
    let childTimezoneLog: string | undefined;
    const executionState = resolveDefaultTargetExecutionState({
      scheduledDate: dto.scheduledDate,
      targetExecutionState: dto.targetExecutionState,
    });
    const visibility = dto.visibility ?? PostVisibility.PUBLIC;
    prismaWriteData.targetExecutionState = executionState;
    prismaWriteData.visibility = visibility;
    assertPublishTarget(executionState, dto.credentialId, dto.platform);
    assertVisibilitySupported(visibility, dto.platform);
    await this.assertCampaignMembership(dto);
    if (executionState === TargetExecutionState.SCHEDULED) {
      // Choke point for #5193: every caller of `create()` that schedules a
      // standalone Post — POST /posts, replies, autopilot auto-publish, the
      // workflow Publish node, the legacy repeat scheduler — runs the same
      // channel contract check here instead of each hand-rolling its own
      // (previously divergent, previously text-only-only) platform rules.
      assertValidChannelTargetSchedule({
        caption: dto.description,
        category: dto.category,
        credentialId: dto.credentialId,
        ingredients: dto.ingredients,
        platform: dto.platform,
        publishMode: 'scheduled',
        settings: dto.targetSettings as Record<string, unknown> | undefined,
        visibility,
      });
    }

    // Convert scheduledDate from user timezone to UTC if timezone is provided
    if (dto.scheduledDate && dto.timezone) {
      const convertedDate = TimezoneUtil.convertToUTC(
        new Date(dto.scheduledDate),
        dto.timezone,
      );

      const message = `Converting scheduledDate from ${dto.timezone} to UTC: ${dto.scheduledDate} → ${convertedDate.toISOString()}`;
      if (isChild) childTimezoneLog = message;
      else this.logger.log(message);

      prismaWriteData.scheduledDate = convertedDate;
    }

    const created = isChild
      ? await this.createChildPost(prismaWriteData, populate)
      : await super.create(
          prismaWriteData as unknown as CreatePostDto,
          populate,
        );
    if (childTimezoneLog) this.logger.log(childTimezoneLog);
    await this.bindScheduledPublish(created, dto.userId);
    return created;
  }

  private async createChildPost(
    data: Record<string, unknown>,
    populate: PopulateInput,
  ): Promise<PostDocument> {
    const result = await this.prisma.$transaction((tx) =>
      createPostChildWithLearning(
        tx,
        this.postLearningContext(),
        data,
        populate,
      ),
    );
    await this.invalidatePostMutationCache();
    for (const emit of result.afterCommit) emit();
    return result.createdPost;
  }

  findOne(
    params: Record<string, unknown>,
    populate: PopulateInput = [
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

    return results;
  }

  async listContentMentions(
    organizationId: string,
    brandId?: string,
    limit: number = DEFAULT_CONTENT_MENTION_LIMIT,
  ): Promise<AgentContentMentionItem[]> {
    if (!organizationId) {
      return [];
    }

    const safeLimit = Math.min(Math.max(limit, 1), MAX_CONTENT_MENTION_LIMIT);
    const posts = (await this.prisma.post.findMany({
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      select: {
        brandId: true,
        category: true,
        description: true,
        entityArticle: {
          select: {
            coverImageUrl: true,
            label: true,
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
      where: scopedWhere(organizationId, brandId ? { brandId } : {}),
    })) as unknown as ContentMentionPostRecord[];

    return posts.map((post) => ({
      brandId: post.brandId,
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
      post.entityArticle?.label.trim() ||
      post.description.trim();

    if (title.length <= 80) {
      return title;
    }

    return `${title.slice(0, 77)}...`;
  }

  async patch(
    id: string,
    dto: PostUpdateInput,
    populate: PopulateInput = [
      PopulatePatterns.ingredientsMinimal,
      PopulatePatterns.credentialMinimal,
      PopulatePatterns.userMinimal,
      PopulatePatterns.brandMinimal,
    ],
  ): Promise<PostDocument> {
    if (!id) throw new ValidationException('Document ID is required');
    if (!dto || typeof dto !== 'object')
      throw new ValidationException('Update data is required');
    const result = await this.prisma.$transaction((tx) =>
      patchPostWithLearning(tx, this.postLearningContext(), id, dto, populate),
    );
    const { updatedPost, currentPost, isPublishingPost } = result;
    await this.invalidatePostMutationCache();
    for (const args of result.logs) this.logger.log(...args);
    for (const emit of result.afterCommit) emit();
    if (
      isPublishingPost &&
      updatedPost.targetExecutionState === TargetExecutionState.PUBLISHED &&
      currentPost?.targetExecutionState !== TargetExecutionState.PUBLISHED
    )
      await this.completePublishFirstPostMission(updatedPost);
    await this.bindScheduledPublish(updatedPost, dto.userId);
    return updatedPost;
  }

  private postLearningContext(): PostLearningMutationContext {
    return {
      logger: this.logger,
      publishApprovalsService: this.publishApprovalsService,
      createPost: async (tx, data, populate) => {
        const include = this.populateToInclude(populate) as
          | Prisma.PostInclude
          | undefined;
        const row = await tx.post.create({
          data: this.normalizeData(data) as Prisma.PostCreateArgs['data'],
          ...(include ? { include } : {}),
        });
        return this.normalizeDocument(row);
      },
      readPost: async (tx, where, populate) => {
        const include = this.populateToInclude(populate) as
          | Prisma.PostInclude
          | undefined;
        const row = await tx.post.findFirst({
          ...(include ? { include } : {}),
          where: scopedWhere(where.organizationId, where),
        });
        return row ? this.normalizeDocument(row) : null;
      },
      writePost: async (tx, where, data, populate) => {
        const include = this.populateToInclude(populate) as
          | Prisma.PostInclude
          | undefined;
        const row = await tx.post.update({
          ...(include ? { include } : {}),
          where: scopedWhere(where.organizationId, where),
          data: this.normalizeData(data) as Prisma.PostUncheckedUpdateInput,
        });
        return this.normalizeDocument(row);
      },
    };
  }

  async recordExternalPublication(
    input: ExtensionPublicationCaptureInput,
    scope: ExtensionPublicationCaptureScope,
  ): Promise<ExtensionPublicationCaptureResult> {
    const capture = parseExtensionPublicationCaptureInput(input);
    if (
      !scope.organizationId?.trim() ||
      !scope.userId?.trim() ||
      !scope.brandId?.trim() ||
      scope.brandId !== capture.brandId
    ) {
      throw new ForbiddenException(
        'Reported publication requires its authenticated organization, user and matching brand',
      );
    }
    const normalized = normalizeExtensionPublication(capture);
    const credentialPlatform = toPrismaCredentialPlatform(capture.platform);
    if (!credentialPlatform)
      throw new BadRequestException('Unsupported publication platform');
    const result = await this.prisma.$transaction(async (tx) => {
      const brand = await tx.brand.findFirst({
        where: {
          id: scope.brandId,
          organizationId: scope.organizationId,
          isDeleted: false,
        },
        select: { id: true },
      });
      if (!brand)
        throw new ForbiddenException(
          'Publication brand is unavailable in this organization',
        );
      const key = JSON.stringify([
        'extension-publication',
        scope.organizationId,
        scope.brandId,
        capture.platform,
      ]);
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))::text`;
      const identities: Prisma.PostWhereInput[] = [];
      if (normalized.externalId)
        identities.push({ externalId: normalized.externalId });
      if (normalized.url) identities.push({ url: normalized.url });
      const existing = await tx.post.findMany({
        where: {
          organizationId: scope.organizationId,
          brandId: scope.brandId,
          platform: capture.platform,
          isDeleted: false,
          OR: identities,
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 2,
      });
      if (existing.length > 1)
        throw new ConflictException(
          'Multiple active publications match the reported identity',
        );
      if (existing.length === 1) {
        if (
          existing[0].targetExecutionState !== TargetExecutionState.PUBLISHED
        ) {
          throw new ConflictException(
            'The reported identity belongs to a post in another lifecycle state',
          );
        }
        return extensionPublicationCaptureResult(existing[0], false);
      }
      let credentialId: string | null = null;
      const author = capture.author;
      const normalizeHandle = (handle: string | null | undefined) =>
        handle?.trim().replace(/^@/, '').toLowerCase() ?? '';
      if (author?.externalId || normalizeHandle(author?.handle)) {
        const credentials = await tx.credential.findMany({
          where: {
            organizationId: scope.organizationId,
            brandId: scope.brandId,
            platform: credentialPlatform,
            isDeleted: false,
            isConnected: true,
            ...(author?.externalId ? { externalId: author.externalId } : {}),
          },
          select: {
            id: true,
            externalId: true,
            externalHandle: true,
            username: true,
            isConnected: true,
          },
        });
        const matches = credentials.filter((credential) =>
          author?.externalId
            ? credential.externalId === author.externalId
            : normalizeHandle(credential.externalHandle) ===
                normalizeHandle(author?.handle) ||
              normalizeHandle(credential.username) ===
                normalizeHandle(author?.handle),
        );
        if (matches.length === 1) credentialId = matches[0].id;
      }
      const availability = extensionPublicationAnalyticsAvailability(
        normalized.externalId,
        credentialId,
        capture.platform,
        capture.publicationKind,
        normalized.urlIdentity,
      );
      const observedVisibility = resolveExtensionPublicationObservedVisibility(
        capture.observedVisibility,
      );
      const visibility =
        observedVisibility === 'public'
          ? PostVisibility.PUBLIC
          : observedVisibility === 'private'
            ? PostVisibility.PRIVATE
            : observedVisibility === 'unlisted'
              ? PostVisibility.UNLISTED
              : null;
      const data: Prisma.PostUncheckedCreateInput = {
        userId: scope.userId,
        organizationId: scope.organizationId,
        brandId: scope.brandId,
        platform: capture.platform,
        credentialId,
        description: capture.description,
        label: capture.description.slice(0, 80) || 'Captured publication',
        category: PostCategory.TEXT,
        source: 'extension',
        externalId: normalized.externalId,
        url: normalized.url,
        publicationDate: new Date(capture.publicationDate),
        publishedAt: new Date(capture.publicationDate),
        targetExecutionState: TargetExecutionState.PUBLISHED,
        visibility,
        status: projectLegacyPostStatus(
          TargetExecutionState.PUBLISHED,
          visibility ?? PostVisibility.PUBLIC,
        ),
        isDeleted: false,
        targetSettings: {
          extensionCapture: {
            version: 1,
            observedByUserId: scope.userId,
            observedAt: new Date().toISOString(),
            publicationDate: capture.publicationDate,
            publicationKind: capture.publicationKind,
            urlKind: normalized.urlKind,
            contextUrl: normalized.contextUrl,
            urlIdentity: normalized.urlIdentity
              ? { ...normalized.urlIdentity }
              : null,
            author: capture.author ? { ...capture.author } : null,
            evidence: 'client-reported-publication',
            observedVisibility,
          },
        },
        isAnalyticsEnabled: availability === 'eligible',
        analyticsCollectionState: 'unavailable',
        analyticsNextCollectAt: new Date(),
        analyticsCollectionError:
          extensionPublicationAnalyticsError(availability) ?? Prisma.DbNull,
      };
      return extensionPublicationCaptureResult(
        await tx.post.create({ data }),
        true,
      );
    });
    if (result.created) await this.invalidatePostMutationCache();
    return result;
  }

  private async invalidatePostMutationCache(): Promise<void> {
    await this.cacheService?.invalidateByTags([
      this.collectionName,
      `collection:${this.collectionName}`,
      `query:${this.collectionName}`,
      paginatedQueryCacheTag(this.collectionName),
    ]);
  }

  private async assertCampaignMembership(dto: PostCreateInput): Promise<void> {
    if (!dto.campaignId) {
      return;
    }
    const organizationId = dto.organizationId;
    if (!organizationId) {
      throw new BadRequestException(
        'Campaign membership requires an organization id.',
      );
    }
    const campaign = await this.prisma.campaign.findFirst({
      select: { id: true },
      where: scopedWhere(organizationId, {
        ...(dto.brandId ? { brandId: dto.brandId } : {}),
        id: dto.campaignId,
      }),
    });
    if (!campaign) {
      throw new BadRequestException(
        `Campaign '${dto.campaignId}' is unavailable in this organization`,
      );
    }
  }

  protected override normalizeDocument(document: unknown): PostDocument {
    const post = document as PostDocument;
    const persistedState = post.targetExecutionState as TargetExecutionState;
    const targetExecutionState = Object.values(TargetExecutionState).includes(
      persistedState,
    )
      ? persistedState
      : TargetExecutionState.DRAFT;
    const captureVisibility = resolveExtensionPublicationObservedVisibility(
      post.visibility,
    );
    const visibility = isExtensionPublicationCapture(post)
      ? captureVisibility === 'unknown'
        ? null
        : resolvePostVisibility(captureVisibility)
      : resolvePostVisibility(post.visibility);
    return {
      ...post,
      status: projectLegacyPostStatus(
        targetExecutionState,
        visibility ?? PostVisibility.PUBLIC,
      ),
      targetExecutionState,
      visibility,
    };
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
    actorUserId: string,
  ): Promise<PostBatchScheduleResult> {
    return batchSchedulePosts(
      {
        actorUserId,
        cacheService: this.cacheService,
        cacheTags: [
          this.collectionName,
          `collection:${this.collectionName}`,
          `query:${this.collectionName}`,
          paginatedQueryCacheTag(this.collectionName),
        ],
        logger: this.logger,
        normalizeData: (data) =>
          this.normalizeData(data) as Record<string, unknown>,
        normalizeDocument: (document) => this.normalizeDocument(document),
        scheduledPostWorkflowQueue: this.scheduledPostWorkflowQueue,
        prisma: this.prisma,
        publishApprovalsService: this.publishApprovalsService,
      },
      items,
      organizationId,
      target,
    );
  }

  private async bindScheduledPublish(
    post: PostDocument | null | undefined,
    actorUserId?: string | null,
  ): Promise<void> {
    if (!post) {
      return;
    }
    await bindScheduledPublishApproval({
      actorUserId,
      post,
      scheduledPostWorkflowQueue: this.scheduledPostWorkflowQueue,
      publishApprovalsService: this.publishApprovalsService,
    });
  }

  private async completePublishFirstPostMission(
    post: Pick<PostDocument, 'organizationId' | 'userId'>,
  ): Promise<void> {
    if (post.organizationId)
      await this.onboardingCreditGrantsService.completeMissions(
        post.organizationId,
        ['publish_first_post'],
        post.userId ?? undefined,
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

    if (
      fromPrismaCredentialPlatform(String(credential.platform ?? '')) !==
      CredentialPlatform.YOUTUBE
    ) {
      this.logger.warn(
        `handleYoutubePost called for non-YouTube platform: ${credential.platform}`,
      );
      return;
    }

    const originalVisibility = resolvePostVisibility(post.visibility);
    const postId = String(post.id);

    await this.patch(postId, {
      targetExecutionState: TargetExecutionState.PUBLISHING,
    });

    try {
      const brandId = post.brandId;
      const organizationId = post.organizationId;
      const userId = post.userId;

      await this.fileQueueService?.uploadYoutube({
        brandId,
        credentialId: credential.id.toString(),
        description: post.description || '',
        ingredientId: ingredient.id.toString(),
        organizationId,
        postId,
        room: userId ? getUserRoomName(userId) : undefined,
        scheduledDate: post.scheduledDate ?? undefined,
        visibility: originalVisibility,
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
        targetExecutionState: TargetExecutionState.FAILED,
      });

      throw error;
    }
  }

  /**
   * Count posts matching filter
   */
  async count(
    organizationId: string,
    filter: Prisma.PostWhereInput = {},
  ): Promise<number> {
    return this.prisma.post.count({
      where: scopedWhere(organizationId, filter),
    });
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
      format: PostFormat.THREAD,
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
        format: PostFormat.THREAD,
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

    return children;
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

    if (rootPost.format !== PostFormat.THREAD) {
      await this.patch(rootPostId, { format: PostFormat.THREAD }, []);
    }

    const childrenCount = await this.prisma.post.count({
      where: scopedWhere(parentPost.organizationId, { parentId: rootPostId }),
    });

    const { parentId: _parentId, ...dtoWithoutParent } = dto;

    const replyDto = {
      ...dtoWithoutParent,
      format: PostFormat.THREAD,
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
      targetExecutionState: TargetExecutionState.DRAFT,
      tags: tagIds,
      timezone: originalPost.timezone || 'UTC',
      userId: dto.userId,
      visibility: resolvePostVisibility(originalPost.visibility),
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
   */
  @HandleErrors('remove post with cascade', 'posts')
  async remove(id: string): Promise<PostDocument | null> {
    if (!id) {
      throw new Error('Post ID is required');
    }

    const result = await this.prisma.$transaction((tx) =>
      removePostWithLearning(tx, this.postLearningContext(), id),
    );
    if (!result) {
      this.logger.warn(`Post ${id} not found for deletion`);
      return null;
    }
    await this.invalidatePostMutationCache();
    this.logger.log('Post soft deleted successfully', {
      childrenDeleted: result.childrenDeleted,
      id,
    });
    return result.deletedPost;
  }
}
