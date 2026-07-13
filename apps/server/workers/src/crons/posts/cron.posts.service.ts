import { ActivityEntity } from '@api/collections/activities/entities/activity.entity';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { PostEntity } from '@api/collections/posts/entities/post.entity';
import type { PostDocument } from '@api/collections/posts/schemas/post.schema';
import { PostsService } from '@api/collections/posts/services/posts.service';
import {
  SYSTEM_WORKFLOW_ACTION_IDS,
  SystemWorkflowProvenanceService,
} from '@api/collections/workflows/services/system-workflow-provenance.service';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import type {
  PublishContext,
  PublishResult,
} from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { PublisherFactoryService } from '@api/services/integrations/publishers/publisher-factory.service';
import { QuotaService } from '@api/services/quota/quota.service';
import { PublishEventWebhookService } from '@api/services/webhook-client/webhook-client.module';
import {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
  CredentialPlatform,
  PostCategory,
  PostFrequency,
  PostStatus,
  WorkflowExecutionTrigger,
} from '@genfeedai/enums';
import type { AgentScopeSource } from '@genfeedai/interfaces';
import type { PostPublishJobData } from '@genfeedai/queue-contracts';
import {
  AgentScopeContextService,
  PostPublishQueueService,
} from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

type CronPostChild = {
  id?: unknown;
  category?: unknown;
  description?: string;
  ingredients?: unknown[];
  label?: string;
  order?: number;
};

type QuotaCheckResult = {
  allowed: boolean;
  currentCount: number;
  dailyLimit: number;
};

type QueuedPostPublishSkip = {
  reason: 'not_eligible';
  skipped: true;
};

@Injectable()
export class CronPostsService {
  private readonly constructorName: string = String(this.constructor.name);
  private readonly MAX_RETRY_ATTEMPTS = 3;
  private readonly RETRY_BACKOFF_SECONDS = 60; // Minimum delay between retry attempts

  constructor(
    private readonly logger: LoggerService,
    private readonly activitiesService: ActivitiesService,
    private readonly credentialsService: CredentialsService,
    private readonly organizationsService: OrganizationsService,
    private readonly postsService: PostsService,
    private readonly quotaService: QuotaService,
    private readonly publisherFactory: PublisherFactoryService,
    private readonly systemWorkflowProvenanceService: SystemWorkflowProvenanceService,
    private readonly publishEventWebhookService: PublishEventWebhookService,
    private readonly postPublishQueueService: PostPublishQueueService,
    private readonly agentScopeContextService: AgentScopeContextService,
  ) {}

  /**
   * Publishes due scheduled posts. Fired every 15 minutes by the
   * system-sweeps BullMQ Job Scheduler (SystemSweepsProcessor).
   */
  async publishScheduledPosts(): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const posts = await this.findDueScheduledPosts();

      this.logger.log(`${url} found ${posts.length} posts`, {
        total: posts.length,
        totalDocs: posts.length,
      });

      if (posts.length === 0) {
        this.logger.log(`${url} no posts to process`);
        return;
      }

      await this.enqueuePostPublishJobs(posts);
    } catch (error: unknown) {
      this.logger.error(`${url} error`, { error });
    }
  }

  async processQueuedPost(
    data: PostPublishJobData,
  ): Promise<PublishResult | QueuedPostPublishSkip> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const post = await this.findQueuedPostForPublish(data);

    if (!post) {
      this.logger.log(`${url} skipped stale post publish job`, {
        organizationId: data.organizationId,
        postId: data.postId,
        source: data.source,
      });
      return { reason: 'not_eligible', skipped: true };
    }

    return this.publishPostWithSideEffects(post);
  }

  private async enqueuePostPublishJobs(posts: PostEntity[]): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    await Promise.all(
      posts.map(async (post) => {
        const organizationId = this.readPostString(post, [
          'organization',
          'organizationId',
        ]);
        if (!organizationId) {
          this.logger.warn(`${url} missing organization for post publish job`, {
            postId: post.id,
          });
          return;
        }

        await this.postPublishQueueService.enqueue({
          organizationId,
          postId: post.id.toString(),
          source: 'scheduled_sweep',
        });
      }),
    );
  }

  private async publishPostWithSideEffects(
    post: PostEntity,
  ): Promise<PublishResult> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    try {
      await this.assertAgentPublishingScope(post);
    } catch (error: unknown) {
      return this.handleTerminalPublishValidationFailure(post, error);
    }
    const result = await this.publishSinglePost(post);

    if (result.success) {
      await this.activitiesService.create(
        new ActivityEntity({
          brand: this.readPostString(post, ['brandId', 'brand']) ?? null,
          entityId: post.id,
          entityModel: ActivityEntityModel.POST,
          key: ActivityKey.POST_PUBLISHED,
          organization:
            this.readPostString(post, ['organizationId', 'organization']) ??
            null,
          source: ActivitySource.POST,
          user: this.readPostString(post, ['userId', 'user']) ?? null,
          value: `Published to ${result.platform}: ${result.url}`,
        }),
      );

      if (post.isRepeat && post.repeatFrequency) {
        await this.scheduleNextRepeat(post, url);
      }
    }

    return result;
  }

  private async handleTerminalPublishValidationFailure(
    post: PostEntity,
    error: unknown,
  ): Promise<PublishResult> {
    const errorMessage =
      error instanceof Error ? error.message : 'Agent scope validation failed';

    this.logger.error('Agent scope validation rejected queued publishing', {
      error: errorMessage,
      postId: post.id,
    });
    await this.attemptRetry(post, false, errorMessage);
    this.emitPublishFailedWebhook(post, errorMessage);

    return this.createFailedResult('', errorMessage);
  }

  private async assertAgentPublishingScope(post: PostEntity): Promise<void> {
    const threadId = this.readPostString(post, ['agentThreadId']);
    if (!threadId) {
      return;
    }

    const record = post as unknown as Record<string, unknown>;
    const contextVersion = record.agentContextVersion;
    const source = record.agentContextSource;
    const organizationId = this.readPostString(post, [
      'organizationId',
      'organization',
    ]);
    const userId = this.readPostString(post, ['userId', 'user']);

    if (
      typeof contextVersion !== 'number' ||
      !this.isAgentScopeSource(source) ||
      !organizationId ||
      !userId
    ) {
      throw new Error(
        `Post ${post.id.toString()} has an incomplete durable agent scope.`,
      );
    }

    const brandId = this.readPostString(post, ['brandId', 'brand']);
    const scope = {
      brandId,
      contextVersion,
      isLegacyFallback: source.startsWith('legacy_'),
      isVersionExplicit: true,
      organizationId,
      source,
      threadId,
      userId,
    };

    await this.agentScopeContextService.assertConsequentialBoundary(
      scope,
      'publish',
    );
    this.agentScopeContextService.assertResourceBrand(
      scope,
      brandId,
      'queued post',
    );
  }

  private isAgentScopeSource(value: unknown): value is AgentScopeSource {
    return (
      value === 'explicit' ||
      value === 'thread_created' ||
      value === 'legacy_execution_policy' ||
      value === 'legacy_message_history' ||
      value === 'legacy_organization_only'
    );
  }

  private async findQueuedPostForPublish(
    data: PostPublishJobData,
  ): Promise<PostEntity | null> {
    const posts = await this.findDueScheduledPosts({
      limit: 1,
      organizationId: data.organizationId,
      postId: data.postId,
    });

    return posts[0] ?? null;
  }

  private async findDueScheduledPosts(
    filter: { limit?: number; organizationId?: string; postId?: string } = {},
  ): Promise<PostEntity[]> {
    const now = new Date();
    const backoffThreshold = new Date(
      now.getTime() - this.RETRY_BACKOFF_SECONDS * 1000,
    );

    const posts = await this.postsService.findAll(
      {
        include: {
          children: {
            include: {
              credential: true,
              ingredients: true,
            },
            where: {
              status: PostStatus.SCHEDULED,
            },
          },
          ingredients: true,
        },
        where: {
          ...(filter.postId ? { id: filter.postId } : {}),
          ...(filter.organizationId
            ? { organizationId: filter.organizationId }
            : {}),
          AND: [
            {
              OR: [
                { lastAttemptAt: null },
                { lastAttemptAt: { lte: backoffThreshold } },
              ],
            },
          ],
          OR: [
            { scheduledDate: { lte: now } },
            { nextScheduledDate: { lte: now } },
          ],
          isDeleted: false,
          parentId: null,
          status: { in: [PostStatus.SCHEDULED, PostStatus.PROCESSING] },
        },
      },
      {
        customLabels,
        limit: filter.limit ?? 50,
        page: 1,
      },
    );

    return posts.docs as unknown as PostEntity[];
  }

  private readPostString(
    post: PostEntity,
    keys: readonly string[],
  ): string | undefined {
    const record = post as unknown as Record<string, unknown>;
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'string' && value.length > 0) {
        return value;
      }
      if (value && typeof value === 'object' && 'id' in value) {
        const id = (value as { id?: unknown }).id;
        if (typeof id === 'string' && id.length > 0) {
          return id;
        }
      }
    }

    return undefined;
  }

  /**
   * Publish a single post using the appropriate platform publisher
   */
  private async publishSinglePost(post: PostEntity): Promise<PublishResult> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    // Mark post as PROCESSING immediately to prevent race conditions and show user feedback
    // lastAttemptAt enforces 60s backoff between attempts
    await this.postsService.patch(post.id.toString(), {
      lastAttemptAt: new Date(),
      status: PostStatus.PROCESSING,
    });

    const postCredentialId = this.readPostString(post, [
      'credentialId',
      'credential',
    ]);
    const postOrganizationId = this.readPostString(post, [
      'organizationId',
      'organization',
    ]);
    const postBrandId = this.readPostString(post, ['brandId', 'brand']);
    const postUserId = this.readPostString(post, ['userId', 'user']);

    try {
      // Get credential
      const credential = await this.credentialsService.findOne({
        _id: postCredentialId,
      });

      if (!credential) {
        this.logger.error(`${url} credential not found`, { postId: post.id });
        await this.postsService.patch(post.id, { status: PostStatus.FAILED });
        this.emitPublishFailedWebhook(post, 'Credential not found');
        return this.createFailedResult('', 'Credential not found');
      }

      // Get organization
      const organization = await this.organizationsService.findOne({
        _id: postOrganizationId,
      });

      if (!organization) {
        this.logger.error(`${url} organization not found`, {
          postId: post.id,
        });
        await this.postsService.patch(post.id, { status: PostStatus.FAILED });
        this.emitPublishFailedWebhook(post, 'Organization not found');
        return this.createFailedResult('', 'Organization not found');
      }

      // Check quota
      const quotaCheck = (await this.quotaService.checkQuota(
        credential,
        organization,
      )) as QuotaCheckResult;
      if (!quotaCheck.allowed) {
        this.logger.warn(`${url} quota exceeded for ${credential.platform}`, {
          currentCount: quotaCheck.currentCount,
          dailyLimit: quotaCheck.dailyLimit,
          platform: credential.platform,
          postId: post.id,
        });

        await this.postsService.patch(post.id, { status: PostStatus.FAILED });
        await this.logQuotaExceededActivity(
          post,
          quotaCheck,
          credential.platform,
        );
        this.emitPublishFailedWebhook(
          post,
          'Quota exceeded',
          credential.platform,
        );

        return this.createFailedResult(credential.platform, 'Quota exceeded');
      }

      // Get publisher for platform
      const platform = credential.platform as CredentialPlatform;
      const publisher = this.publisherFactory.getPublisher(platform);
      if (!publisher) {
        this.logger.error(`${url} unsupported platform`, {
          platform: credential.platform,
          postId: post.id,
        });
        await this.postsService.patch(post.id, { status: PostStatus.FAILED });
        this.emitPublishFailedWebhook(post, 'Unsupported platform', platform);
        return this.createFailedResult(platform, 'Unsupported platform');
      }

      // Build publish context
      const context: PublishContext = {
        brandId: postBrandId ?? '',
        credential,
        organization,
        organizationId: postOrganizationId ?? '',
        post,
        postId: post.id.toString(),
      };

      // Publish using the platform publisher, with a durable workflow execution
      // record so scheduled publishing is inspectable as a system workflow.
      const { result } = await this.systemWorkflowProvenanceService.runAction(
        {
          actionType: 'publish-post',
          canonicalId: SYSTEM_WORKFLOW_ACTION_IDS.SCHEDULED_POST_PUBLISHING,
          description:
            'Publishes due scheduled posts through the connected brand credential.',
          failureMessage: (publishResult) =>
            publishResult.success
              ? undefined
              : publishResult.error || 'Scheduled post publishing failed',
          inputValues: {
            brandId: postBrandId ?? '',
            platform: credential.platform,
            postId: post.id.toString(),
            scheduledDate:
              post.scheduledDate instanceof Date
                ? post.scheduledDate.toISOString()
                : post.scheduledDate,
          },
          label: 'Scheduled Post Publishing',
          metadata: {
            credentialId: credential.id?.toString?.() ?? credential.id,
            hasThreadChildren: Boolean(post.children?.length),
          },
          organizationId: postOrganizationId ?? '',
          postIds: [post.id.toString()],
          schedule: '*/15 * * * *',
          source: 'CronPostsService.publishSinglePost',
          trigger: WorkflowExecutionTrigger.SCHEDULED,
          userId: postUserId,
        },
        () => publisher.publish(context),
      );

      if (result.success && result.externalId) {
        // Check if this is a PENDING post (e.g., TikTok deferred verification)
        if (result.status === PostStatus.PENDING) {
          // Store publish_id temporarily, mark as PENDING
          // Cron job will verify and update to PUBLIC once platform confirms
          await this.postsService.patch(post.id, {
            externalId: result.externalId, // publish_id stored here temporarily
            status: PostStatus.PENDING,
            // Do NOT set publicationDate yet - not actually published
          });

          this.logger.log(
            `${url} post marked PENDING for deferred verification`,
            {
              platform: credential.platform,
              postId: post.id.toString(),
              publishId: result.externalId,
            },
          );

          return result;
        }

        // Immediate success - update post with external ID and status
        await this.postsService.patch(post.id, {
          externalId: result.externalId,
          externalShortcode: result.externalShortcode ?? undefined,
          publicationDate: new Date(),
          status: PostStatus.PUBLIC,
        });

        // Handle thread children (for platforms that support threads)
        const children = (post.children || []) as unknown as PostDocument[];
        if (children.length > 0 && publisher.supportsThreads) {
          if (publisher.publishThreadChildren) {
            await publisher.publishThreadChildren(
              context,
              children,
              result.externalId,
            );
          } else {
            this.logger.warn(
              `${url} platform supports threads but publishThreadChildren not implemented`,
              {
                childrenCount: children.length,
                platform: credential.platform,
                postId: post.id.toString(),
              },
            );
          }
        }

        this.emitPublishPublishedWebhook(post, result, credential.platform);

        this.logger.log(`${url} published post successfully`, {
          childrenCount: children.length,
          externalId: result.externalId,
          platform: credential.platform,
          postId: post.id.toString(),
        });
      } else if (!result.success) {
        // Handle retry logic
        return await this.handlePublishFailure(
          post,
          result,
          credential.platform,
        );
      }

      return result;
    } catch (error: unknown) {
      return await this.handlePublishError(post, error);
    }
  }

  /**
   * Common retry handler for both failure and error cases
   * Returns true if post was scheduled for retry, false if max retries reached
   */
  private async attemptRetry(
    post: PostEntity,
    canRetry: boolean,
    errorMessage: string,
  ): Promise<boolean> {
    const url = `${this.constructorName} attemptRetry`;
    const currentRetryCount = post.retryCount || 0;

    if (canRetry) {
      await this.postsService.patch(post.id.toString(), {
        lastAttemptAt: new Date(),
        retryCount: currentRetryCount + 1,
      });

      this.logger.log(
        `${url} will retry post (attempt ${currentRetryCount + 1}/${this.MAX_RETRY_ATTEMPTS}) after ${this.RETRY_BACKOFF_SECONDS}s backoff`,
        { postId: post.id },
      );

      return true;
    }

    // Max retries reached - mark parent and children as failed
    await this.postsService.patch(post.id.toString(), {
      lastAttemptAt: new Date(),
      status: PostStatus.FAILED,
    });
    await this.failChildren(post, 'Parent post failed');
    await this.logFailedActivity(post, errorMessage);

    return false;
  }

  /**
   * Handle publish failure with retry logic
   */
  private async handlePublishFailure(
    post: PostEntity,
    result: PublishResult,
    platform: CredentialPlatform | string,
  ): Promise<PublishResult> {
    const currentRetryCount = post.retryCount || 0;
    const canRetry = currentRetryCount < this.MAX_RETRY_ATTEMPTS;
    const errorMessage = result.error || 'Max retries reached';

    const scheduledForRetry = await this.attemptRetry(
      post,
      canRetry,
      errorMessage,
    );

    if (scheduledForRetry) {
      return {
        externalId: null,
        platform,
        status: PostStatus.SCHEDULED,
        success: false,
        url: '',
      };
    }

    this.emitPublishFailedWebhook(post, errorMessage, platform);
    return result;
  }

  /**
   * Handle publish error with retry logic
   */
  private async handlePublishError(
    post: PostEntity,
    error: unknown,
  ): Promise<PublishResult> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const currentRetryCount = post.retryCount || 0;
    const isRetryable = this.isRetryableError(error);
    const canRetry = isRetryable && currentRetryCount < this.MAX_RETRY_ATTEMPTS;
    const errorMessage = (error as Error)?.message || 'Post failed';

    this.logger.error(`${url} failed to publish post`, {
      canRetry,
      error: errorMessage,
      isRetryable,
      postId: post.id,
      retryCount: currentRetryCount,
    });

    const scheduledForRetry = await this.attemptRetry(
      post,
      canRetry,
      errorMessage,
    );

    if (scheduledForRetry) {
      return {
        externalId: null,
        platform: '',
        status: PostStatus.SCHEDULED,
        success: false,
        url: '',
      };
    }

    this.emitPublishFailedWebhook(post, errorMessage);
    return this.createFailedResult('', errorMessage);
  }

  private emitPublishPublishedWebhook(
    post: PostEntity,
    result: PublishResult,
    platform: CredentialPlatform | string,
  ): void {
    void this.publishEventWebhookService.emitLegacyPostPublished({
      externalProviderId: result.externalId ?? null,
      externalShortcode: result.externalShortcode ?? null,
      platform,
      post,
      url: result.url || null,
    });
  }

  private emitPublishFailedWebhook(
    post: PostEntity,
    errorMessage: string,
    platform?: CredentialPlatform | string,
  ): void {
    void this.publishEventWebhookService.emitLegacyPostFailed({
      errorMessage,
      platform,
      post,
    });
  }

  /**
   * Check if an error is retryable
   */
  private isRetryableError(error: unknown): boolean {
    const retryableErrorPatterns = [
      'rate limit',
      'timeout',
      'ETIMEDOUT',
      'ECONNRESET',
      'ECONNREFUSED',
      'ENOTFOUND',
      'socket hang up',
      '429',
      '500',
      '502',
      '503',
      '504',
    ];

    const errorMessage = (error as Error)?.message?.toLowerCase() || '';
    const errorCode =
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code?: unknown }).code ?? '')
        : '';

    return retryableErrorPatterns.some(
      (pattern) =>
        errorMessage.includes(pattern.toLowerCase()) ||
        errorCode.includes(pattern),
    );
  }

  /**
   * Schedule the next repeat post
   */
  protected async scheduleNextRepeat(post: PostEntity, url: string) {
    try {
      const currentCount = post.repeatCount || 0;
      const nextRepeatCount = currentCount + 1;
      const maxRepeats = post.maxRepeats || 0;

      // Increment repeatCount on the current post that just published
      await this.postsService.patch(post.id.toString(), {
        repeatCount: nextRepeatCount,
      });

      // Check if we've reached the maximum number of repeats (after incrementing)
      if (maxRepeats > 0 && nextRepeatCount >= maxRepeats) {
        this.logger.log(`${url} maximum repeats reached`, {
          maxRepeats,
          postId: post.id,
          repeatCount: nextRepeatCount,
        });
        return;
      }

      // Check if we've reached the end date
      if (post.repeatEndDate && new Date() >= new Date(post.repeatEndDate)) {
        this.logger.log(`${url} repeat end date reached`, {
          endDate: post.repeatEndDate,
          postId: post.id,
        });
        return;
      }

      const nextDate = this.calculateNextScheduleDate(post);
      if (!nextDate) {
        this.logger.warn(`${url} unable to calculate next schedule date`, {
          postId: post.id,
        });
        return;
      }

      // Create new post for the next repeat
      const ingredients = post.ingredients || [];

      const postData = {
        ...(post.agentThreadId
          ? {
              agentContextSource: post.agentContextSource,
              agentContextVersion: post.agentContextVersion,
              agentThreadId: post.agentThreadId,
            }
          : {}),
        brand: this.readPostString(post, ['brandId', 'brand']) ?? '',
        category: (post.category as PostCategory) || PostCategory.VIDEO,
        credential:
          this.readPostString(post, ['credentialId', 'credential']) ?? '',
        description: post.description,
        ingredients: ingredients,
        isRepeat: true,
        label: post.label,
        maxRepeats: post.maxRepeats,
        organization:
          this.readPostString(post, ['organizationId', 'organization']) ?? '',
        platform: post.platform,
        repeatCount: nextRepeatCount, // Track repeat count on new post
        repeatDaysOfWeek: post.repeatDaysOfWeek,
        repeatEndDate: post.repeatEndDate,
        repeatFrequency: post.repeatFrequency as PostFrequency,
        repeatInterval: post.repeatInterval,
        scheduledDate: nextDate,
        status: PostStatus.SCHEDULED,
        tags: post.tags,
        user: this.readPostString(post, ['userId', 'user']) ?? '',
      };

      const newPost = await this.postsService.create(postData);

      // Clone children (thread replies) for the new repeat post
      const children = (post.children || []) as unknown as CronPostChild[];
      if (children.length > 0) {
        await this.cloneChildrenForRepeat(
          children,
          newPost.id.toString(),
          post,
          nextDate, // Use new parent's scheduled date, not the old one
          url,
        );
      }

      this.logger.log(`${url} scheduled next repeat post`, {
        childrenCloned: children.length,
        newPostId: newPost.id,
        nextDate,
        originalPostId: post.id,
        repeatCount: nextRepeatCount,
      });
    } catch (error: unknown) {
      this.logger.error(`${url} failed to schedule next repeat`, {
        error,
        postId: post.id,
      });
    }
  }

  /**
   * Clone children posts for a repeat post
   */
  private async cloneChildrenForRepeat(
    children: CronPostChild[],
    newParentId: string,
    originalParent: PostEntity,
    newScheduledDate: Date,
    url: string,
  ): Promise<void> {
    for (const child of children) {
      try {
        const childIngredients = child.ingredients || [];
        // Extract ingredient IDs (handle both ObjectId and populated objects)
        const ingredientIds = childIngredients
          .map((ingredient: unknown) =>
            ingredient && typeof ingredient === 'object' && 'id' in ingredient
              ? (ingredient as { id?: unknown }).id
              : ingredient,
          )
          .map((ingredient) => String(ingredient));

        const childData = {
          ...(originalParent.agentThreadId
            ? {
                agentContextSource: originalParent.agentContextSource,
                agentContextVersion: originalParent.agentContextVersion,
                agentThreadId: originalParent.agentThreadId,
              }
            : {}),
          brand:
            this.readPostString(originalParent, ['brandId', 'brand']) ?? '',
          category:
            (child.category as PostCategory | undefined) || PostCategory.TEXT,
          credential:
            this.readPostString(originalParent, [
              'credentialId',
              'credential',
            ]) ?? '',
          description: child.description || '',
          ingredients: ingredientIds,
          label: child.label || '',
          order: child.order || 0,
          organization:
            this.readPostString(originalParent, [
              'organizationId',
              'organization',
            ]) ?? '',
          parent: newParentId,
          platform: originalParent.platform as never,
          scheduledDate: newScheduledDate, // Use new parent's scheduled date
          status: PostStatus.SCHEDULED,
          user: this.readPostString(originalParent, ['userId', 'user']) ?? '',
        };

        await this.postsService.create(childData);
      } catch (error: unknown) {
        this.logger.error(`${url} failed to clone child for repeat`, {
          error: (error as Error)?.message,
          newParentId,
          originalChildId: String(child.id),
        });
      }
    }
  }

  /**
   * Calculate the next schedule date for a repeat post
   */
  private calculateNextScheduleDate(post: PostEntity): Date | null {
    const currentDate = new Date(post.scheduledDate || post.nextScheduledDate);
    const interval = post.repeatInterval || 1;
    const frequency = post.repeatFrequency;

    switch (frequency) {
      case 'daily':
        currentDate.setDate(currentDate.getDate() + interval);
        break;

      case 'weekly':
        if (post.repeatDaysOfWeek && post.repeatDaysOfWeek.length > 0) {
          return this.getNextDayOfWeek(currentDate, post.repeatDaysOfWeek);
        } else {
          currentDate.setDate(currentDate.getDate() + 7 * interval);
        }
        break;

      case 'monthly':
        currentDate.setMonth(currentDate.getMonth() + interval);
        break;

      case 'yearly':
        currentDate.setFullYear(currentDate.getFullYear() + interval);
        break;

      default:
        return null;
    }

    return currentDate;
  }

  /**
   * Get the next occurrence of a day of week
   */
  private getNextDayOfWeek(currentDate: Date, daysOfWeek: number[]): Date {
    const nextDate = new Date(currentDate);
    const currentDay = nextDate.getDay();

    const sortedDays = [...daysOfWeek].sort((a, b) => a - b);
    const nextDayThisWeek = sortedDays.find((day) => day > currentDay);

    if (nextDayThisWeek !== undefined) {
      nextDate.setDate(nextDate.getDate() + (nextDayThisWeek - currentDay));
    } else {
      const firstDayNextWeek = sortedDays[0];
      const daysToAdd = 7 - currentDay + firstDayNextWeek;
      nextDate.setDate(nextDate.getDate() + daysToAdd);
    }

    return nextDate;
  }

  /**
   * Log quota exceeded activity
   */
  private async logQuotaExceededActivity(
    post: PostEntity,
    quotaCheck: QuotaCheckResult,
    platform: string,
  ): Promise<void> {
    await this.activitiesService.create(
      new ActivityEntity({
        brand: this.readPostString(post, ['brandId', 'brand']) ?? null,
        entityId: post.id,
        entityModel: ActivityEntityModel.POST,
        key: ActivityKey.POST_FAILED,
        organization:
          this.readPostString(post, ['organizationId', 'organization']) ?? null,
        source: ActivitySource.POST,
        user: this.readPostString(post, ['userId', 'user']) ?? null,
        value: `Quota exceeded: ${quotaCheck.currentCount}/${quotaCheck.dailyLimit} posts for ${platform}`,
      }),
    );
  }

  /**
   * Mark all children of a post as failed
   * Called when parent post fails to prevent orphaned scheduled children
   */
  private async failChildren(post: PostEntity, reason: string): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const children = (post.children || []) as unknown as PostDocument[];

    if (children.length === 0) {
      return;
    }

    this.logger.log(`${url} failing ${children.length} children`, {
      childrenCount: children.length,
      parentPostId: post.id.toString(),
      reason,
    });

    for (const child of children) {
      try {
        await this.postsService.patch(child.id.toString(), {
          status: PostStatus.FAILED,
        });
      } catch (error: unknown) {
        this.logger.error(`${url} failed to mark child as failed`, {
          childPostId: child.id.toString(),
          error: (error as Error)?.message,
          parentPostId: post.id.toString(),
        });
      }
    }
  }

  /**
   * Log failed activity
   */
  private async logFailedActivity(
    post: PostEntity,
    errorMessage: string,
  ): Promise<void> {
    await this.activitiesService.create(
      new ActivityEntity({
        brand: this.readPostString(post, ['brandId', 'brand']) ?? null,
        entityId: post.id,
        entityModel: ActivityEntityModel.POST,
        key: ActivityKey.POST_FAILED,
        organization:
          this.readPostString(post, ['organizationId', 'organization']) ?? null,
        source: ActivitySource.POST,
        user: this.readPostString(post, ['userId', 'user']) ?? null,
        value: errorMessage,
      }),
    );
  }

  /**
   * Create a failed publish result
   */
  private createFailedResult(platform: string, error?: string): PublishResult {
    return {
      error,
      externalId: null,
      platform,
      status: PostStatus.FAILED,
      success: false,
      url: '',
    };
  }
}
