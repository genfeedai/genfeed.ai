import { ActivityEntity } from '@api/collections/activities/entities/activity.entity';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { PostEntity } from '@api/collections/posts/entities/post.entity';
import type { PostDocument } from '@api/collections/posts/schemas/post.schema';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import type {
  PublishContext,
  PublishResult,
} from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { PublisherFactoryService } from '@api/services/integrations/publishers/publisher-factory.service';
import { QuotaService } from '@api/services/quota/quota.service';
import {
  childrenPostsLookup,
  ingredientsLookup,
} from '@api/shared/utils/aggregation-builders/lookup-builders';
import {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
  CredentialPlatform,
  PostCategory,
  PostFrequency,
  PostStatus,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

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
  ) {}

  /**
   * Cron job to publish scheduled posts
   * Runs every 10 seconds
   */
  // Run every 15 minutes to check for scheduled posts
  @Cron('*/15 * * * *')
  async publishScheduledPosts(): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const now = new Date();

      const options = {
        customLabels,
        limit: 50,
        page: 1,
      };

      // Calculate backoff threshold - posts attempted within this time are skipped
      const backoffThreshold = new Date(
        now.getTime() - this.RETRY_BACKOFF_SECONDS * 1000,
      );

      // Find all scheduled parent posts that are due
      // Build fresh pipeline array each call to avoid race conditions
      const posts = await this.postsService.findAll(
        [
          {
            $match: {
              // Backoff: skip posts that were attempted recently (within RETRY_BACKOFF_SECONDS)
              // This prevents rapid retries and double-posting from overlapping cron runs
              $and: [
                {
                  $or: [
                    { lastAttemptAt: { $exists: false } },
                    { lastAttemptAt: null },
                    { lastAttemptAt: { $lte: backoffThreshold } },
                  ],
                },
              ],
              $or: [
                { scheduledDate: { $lte: now } },
                { nextScheduledDate: { $lte: now } },
              ],
              isDeleted: false,
              parent: { $exists: false }, // Only parent posts (not thread children)
              status: { $in: [PostStatus.SCHEDULED, PostStatus.PROCESSING] },
            },
          },
          // Populate ingredients for parent
          ingredientsLookup(),
          // Populate children posts (thread replies) with ingredients and credentials
          // Only include SCHEDULED children - DRAFT children should not be published
          childrenPostsLookup({
            includeCredential: true,
            includeIngredients: true,
            statusFilter: [PostStatus.SCHEDULED],
          }),
        ],
        options,
      );

      this.logger.log(`${url} found ${posts.docs?.length || 0} posts`, {
        total: posts.total || 0,
        totalDocs: posts.docs?.length || 0,
      });

      if (posts.docs.length === 0) {
        this.logger.log(`${url} no posts to process`);
        return;
      }

      // Process posts
      await this.processPostGroup(posts.docs);
    } catch (error: unknown) {
      this.logger.error(`${url} error`, { error });
    }
  }

  /**
   * Process a group of posts with parallel execution
   * Uses concurrency limit to avoid overwhelming external APIs
   */
  private async processPostGroup(posts: PostEntity[]) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const CONCURRENCY_LIMIT = 5;

    // Process in batches for controlled concurrency
    for (let i = 0; i < posts.length; i += CONCURRENCY_LIMIT) {
      const batch = posts.slice(i, i + CONCURRENCY_LIMIT);

      const batchPromises = batch.map(async (post) => {
        try {
          const result = await this.publishSinglePost(post);

          if (result.success) {
            // Log successful publication
            await this.activitiesService.create(
              new ActivityEntity({
                brand: post.brand,
                entityId: post._id,
                entityModel: ActivityEntityModel.POST,
                key: ActivityKey.POST_PUBLISHED,
                organization: post.organization,
                source: ActivitySource.POST,
                user: post.user,
                value: `Published to ${result.platform}: ${result.url}`,
              }),
            );

            // Handle repeat scheduling if enabled
            if (post.isRepeat && post.repeatFrequency) {
              await this.scheduleNextRepeat(post, url);
            }
          }
        } catch (error: unknown) {
          this.logger.error(`${url} failed to process post`, {
            error: (error as Error)?.message,
            postId: post._id,
          });
        }
      });

      // Wait for batch to complete before processing next batch
      await Promise.all(batchPromises);
    }
  }

  /**
   * Publish a single post using the appropriate platform publisher
   */
  private async publishSinglePost(post: PostEntity): Promise<PublishResult> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    // Mark post as PROCESSING immediately to prevent race conditions and show user feedback
    // lastAttemptAt enforces 60s backoff between attempts
    await this.postsService.patch(post._id.toString(), {
      lastAttemptAt: new Date(),
      status: PostStatus.PROCESSING,
    });

    try {
      // Get credential
      const credential = await this.credentialsService.findOne({
        _id: post.credential,
      });

      if (!credential) {
        this.logger.error(`${url} credential not found`, { postId: post._id });
        await this.postsService.patch(post._id, { status: PostStatus.FAILED });
        return this.createFailedResult('', 'Credential not found');
      }

      // Get organization
      const organization = await this.organizationsService.findOne({
        _id: post.organization,
      });

      if (!organization) {
        this.logger.error(`${url} organization not found`, {
          postId: post._id,
        });
        await this.postsService.patch(post._id, { status: PostStatus.FAILED });
        return this.createFailedResult('', 'Organization not found');
      }

      // Check quota
      const quotaCheck = await this.quotaService.checkQuota(
        credential,
        organization,
      );
      if (!quotaCheck.allowed) {
        this.logger.warn(`${url} quota exceeded for ${credential.platform}`, {
          currentCount: quotaCheck.currentCount,
          dailyLimit: quotaCheck.dailyLimit,
          platform: credential.platform,
          postId: post._id,
        });

        await this.postsService.patch(post._id, { status: PostStatus.FAILED });
        await this.logQuotaExceededActivity(
          post,
          quotaCheck,
          credential.platform,
        );

        return this.createFailedResult(credential.platform, 'Quota exceeded');
      }

      // Get publisher for platform
      const publisher = this.publisherFactory.getPublisher(credential.platform);
      if (!publisher) {
        this.logger.error(`${url} unsupported platform`, {
          platform: credential.platform,
          postId: post._id,
        });
        await this.postsService.patch(post._id, { status: PostStatus.FAILED });
        return this.createFailedResult(
          credential.platform,
          'Unsupported platform',
        );
      }

      // Build publish context
      const context: PublishContext = {
        brandId: post.brand.toString(),
        credential,
        organization,
        organizationId: post.organization.toString(),
        post,
        postId: post._id.toString(),
      };

      // Publish using the platform publisher
      const result = await publisher.publish(context);

      if (result.success && result.externalId) {
        // Check if this is a PENDING post (e.g., TikTok deferred verification)
        if (result.status === PostStatus.PENDING) {
          // Store publish_id temporarily, mark as PENDING
          // Cron job will verify and update to PUBLIC once platform confirms
          await this.postsService.patch(post._id, {
            externalId: result.externalId, // publish_id stored here temporarily
            status: PostStatus.PENDING,
            // Do NOT set publicationDate yet - not actually published
          });

          this.logger.log(
            `${url} post marked PENDING for deferred verification`,
            {
              platform: credential.platform,
              postId: post._id.toString(),
              publishId: result.externalId,
            },
          );

          return result;
        }

        // Immediate success - update post with external ID and status
        await this.postsService.patch(post._id, {
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
                postId: post._id.toString(),
              },
            );
          }
        }

        this.logger.log(`${url} published post successfully`, {
          childrenCount: children.length,
          externalId: result.externalId,
          platform: credential.platform,
          postId: post._id.toString(),
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
      await this.postsService.patch(post._id.toString(), {
        lastAttemptAt: new Date(),
        retryCount: currentRetryCount + 1,
      });

      this.logger.log(
        `${url} will retry post (attempt ${currentRetryCount + 1}/${this.MAX_RETRY_ATTEMPTS}) after ${this.RETRY_BACKOFF_SECONDS}s backoff`,
        { postId: post._id },
      );

      return true;
    }

    // Max retries reached - mark parent and children as failed
    await this.postsService.patch(post._id.toString(), {
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
      postId: post._id,
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

    return this.createFailedResult('', errorMessage);
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
    const errorCode = error?.code?.toString() || '';

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
      await this.postsService.patch(post._id.toString(), {
        repeatCount: nextRepeatCount,
      });

      // Check if we've reached the maximum number of repeats (after incrementing)
      if (maxRepeats > 0 && nextRepeatCount >= maxRepeats) {
        this.logger.log(`${url} maximum repeats reached`, {
          maxRepeats,
          postId: post._id,
          repeatCount: nextRepeatCount,
        });
        return;
      }

      // Check if we've reached the end date
      if (post.repeatEndDate && new Date() >= new Date(post.repeatEndDate)) {
        this.logger.log(`${url} repeat end date reached`, {
          endDate: post.repeatEndDate,
          postId: post._id,
        });
        return;
      }

      const nextDate = this.calculateNextScheduleDate(post);
      if (!nextDate) {
        this.logger.warn(`${url} unable to calculate next schedule date`, {
          postId: post._id,
        });
        return;
      }

      // Create new post for the next repeat
      const ingredients = post.ingredients || [];

      const postData = {
        brand: post.brand,
        category: (post.category as PostCategory) || PostCategory.VIDEO,
        credential: post.credential,
        description: post.description,
        ingredients: ingredients,
        isRepeat: true,
        label: post.label,
        maxRepeats: post.maxRepeats,
        organization: post.organization,
        platform: post.platform,
        repeatCount: nextRepeatCount, // Track repeat count on new post
        repeatDaysOfWeek: post.repeatDaysOfWeek,
        repeatEndDate: post.repeatEndDate,
        repeatFrequency: post.repeatFrequency as PostFrequency,
        repeatInterval: post.repeatInterval,
        scheduledDate: nextDate,
        status: PostStatus.SCHEDULED,
        tags: post.tags,
        user: post.user,
      };

      const newPost = await this.postsService.create(postData);

      // Clone children (thread replies) for the new repeat post
      const children = (post.children || []) as unknown as PostDocument[];
      if (children.length > 0) {
        await this.cloneChildrenForRepeat(
          children,
          newPost._id.toString(),
          post,
          nextDate, // Use new parent's scheduled date, not the old one
          url,
        );
      }

      this.logger.log(`${url} scheduled next repeat post`, {
        childrenCloned: children.length,
        newPostId: newPost._id,
        nextDate,
        originalPostId: post._id,
        repeatCount: nextRepeatCount,
      });
    } catch (error: unknown) {
      this.logger.error(`${url} failed to schedule next repeat`, {
        error,
        postId: post._id,
      });
    }
  }

  /**
   * Clone children posts for a repeat post
   */
  private async cloneChildrenForRepeat(
    children: unknown[],
    newParentId: string,
    originalParent: PostEntity,
    newScheduledDate: Date,
    url: string,
  ): Promise<void> {
    for (const child of children) {
      try {
        const childIngredients = child.ingredients || [];
        // Extract ingredient IDs (handle both ObjectId and populated objects)
        const ingredientIds = childIngredients.map((ingredient: unknown) => {
          return ingredient?._id ? ingredient._id : ingredient;
        });

        const childData = {
          brand: originalParent.brand,
          category: child.category || PostCategory.TEXT,
          credential: originalParent.credential,
          description: child.description || '',
          ingredients: ingredientIds,
          label: child.label || '',
          order: child.order || 0,
          organization: originalParent.organization,
          parent: newParentId,
          platform: originalParent.platform,
          scheduledDate: newScheduledDate, // Use new parent's scheduled date
          status: PostStatus.SCHEDULED,
          user: originalParent.user,
        };

        await this.postsService.create(childData);
      } catch (error: unknown) {
        this.logger.error(`${url} failed to clone child for repeat`, {
          error: (error as Error)?.message,
          newParentId,
          originalChildId: child._id.toString(),
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
    quotaCheck: unknown,
    platform: string,
  ): Promise<void> {
    await this.activitiesService.create(
      new ActivityEntity({
        brand: post.brand,
        entityId: post._id,
        entityModel: ActivityEntityModel.POST,
        key: ActivityKey.POST_FAILED,
        organization: post.organization,
        source: ActivitySource.POST,
        user: post.user,
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
      parentPostId: post._id.toString(),
      reason,
    });

    for (const child of children) {
      try {
        await this.postsService.patch(child._id.toString(), {
          status: PostStatus.FAILED,
        });
      } catch (error: unknown) {
        this.logger.error(`${url} failed to mark child as failed`, {
          childPostId: child._id.toString(),
          error: (error as Error)?.message,
          parentPostId: post._id.toString(),
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
        brand: post.brand,
        entityId: post._id,
        entityModel: ActivityEntityModel.POST,
        key: ActivityKey.POST_FAILED,
        organization: post.organization,
        source: ActivitySource.POST,
        user: post.user,
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
