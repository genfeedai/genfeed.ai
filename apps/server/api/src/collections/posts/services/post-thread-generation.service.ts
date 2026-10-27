import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import type { ActivityDocument } from '@api/collections/activities/schemas/activity.schema';
import { ExpandToThreadDto } from '@api/collections/posts/dto/expand-thread.dto';
import { TweetTone } from '@api/collections/posts/dto/generate-tweets.dto';
import type { PostDocument } from '@api/collections/posts/post.schema';
import {
  extractPostGenerationLabel,
  parsePostGenerationSlots,
} from '@api/collections/posts/services/post-generation-text.util';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { TemplatesService } from '@api/collections/templates/services/templates.service';
import { DEFAULT_MINI_TEXT_MODEL } from '@api/constants/default-mini-text-model.constant';
import { TEXT_GENERATION_LIMITS } from '@api/constants/text-generation-limits.constant';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import { BRAND_CONTEXT_CHARACTER_BUDGET } from '@api/services/agent-context-assembly/brand-context-budget.util';
import { HarnessGenerationService } from '@api/services/harness/harness-generation.service';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
  ModelCategory,
  PromptTemplateKey,
  Status,
  SystemPromptKey,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type { AccountPublishingConstraints } from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';

type ThreadGenerationMetadata = Pick<
  AuthenticatedUser,
  'brandId' | 'organizationId' | 'userId'
>;

export const THREAD_BRAND_CONTEXT_UNAVAILABLE =
  'Brand context is unavailable for this thread. Please retry.';

const TWITTER_THREAD_CONSTRAINTS: AccountPublishingConstraints = {
  maxWeightedCharacters: 280,
  notes: ['Standard X posts use the 280 weighted-character limit.'],
  supportsDirectPublishing: true,
  supportsRichArticleCopy: false,
  supportsThreads: true,
  usesWeightedCharacters: true,
};

/** Owns the X/Twitter thread-expansion state machine and terminal cleanup. */
@Injectable()
export class PostThreadGenerationService {
  constructor(
    private readonly activityRecorder: ActivityRecorderService,
    private readonly harness: HarnessGenerationService,
    private readonly logger: LoggerService,
    private readonly postsService: PostsService,
    private readonly promptBuilderService: PromptBuilderService,
    private readonly replicateService: ReplicateService,
    private readonly templatesService: TemplatesService,
    private readonly websocketService: NotificationsPublisherService,
  ) {}

  async expandThread(
    originalPost: PostDocument,
    childPosts: PostDocument[],
    dto: ExpandToThreadDto,
    identity: ThreadGenerationMetadata,
    byokApiKeyOverride?: string,
  ): Promise<void> {
    let activity: ActivityDocument | undefined;

    try {
      activity = await this.activityRecorder.record({
        brandId: identity.brandId,
        key: ActivityKey.POST_PROCESSING,
        organizationId: identity.organizationId,
        source: ActivitySource.POST_GENERATION,
        userId: identity.userId,
        value: JSON.stringify({
          count: dto.count,
          originalPostId: String(originalPost.id),
          type: 'thread-expansion',
        }),
      });

      const tweetLines = await this.generateThreadLines(
        originalPost,
        dto,
        identity,
        byokApiKeyOverride,
      );

      const completedCount = await this.completeGeneratedChildren(
        childPosts,
        tweetLines,
        identity,
      );
      try {
        await this.activityRecorder.update(activity, {
          key:
            completedCount === childPosts.length
              ? ActivityKey.POST_GENERATED
              : ActivityKey.POST_FAILED,
          isRead: false,
          value: JSON.stringify({
            originalPostId: String(originalPost.id),
            resultId: String(originalPost.id),
            completedCount,
            totalCount: childPosts.length,
            ...(completedCount < childPosts.length
              ? { error: 'Some posts could not be generated' }
              : {}),
          }),
        });
      } catch (activityError) {
        this.logger.error(
          'Failed to finalize thread generation activity',
          activityError,
        );
      }
    } catch (error) {
      this.logger.error('Failed to expand thread asynchronously', error);
      await this.markActivityFailed(activity, error);

      for (const child of childPosts) {
        await this.markChildFailed(String(child.id), error);
      }
    }
  }

  /**
   * Proposes the replies for a thread without creating or changing any post.
   * The caller shows them for review and saves only the ones the user adds.
   */
  async draftThread(
    originalPost: PostDocument,
    dto: ExpandToThreadDto,
    identity: ThreadGenerationMetadata,
    byokApiKeyOverride?: string,
  ): Promise<string[]> {
    const lines = await this.generateThreadLines(
      originalPost,
      dto,
      identity,
      byokApiKeyOverride,
    );
    return lines.filter((line): line is string => Boolean(line));
  }

  /** One slot per reply after the original; invalid replies stay `null`. */
  private async generateThreadLines(
    originalPost: PostDocument,
    dto: ExpandToThreadDto,
    identity: ThreadGenerationMetadata,
    byokApiKeyOverride?: string,
  ): Promise<Array<string | null>> {
    const additionalCount = dto.count - 1;
    const originalContent =
      originalPost.description?.replace(/<[^>]+>/g, ' ').trim() || '';
    const template = await this.templatesService.getRenderedPrompt(
      PromptTemplateKey.THREAD_EXPAND,
      {
        additionalCount,
        count: dto.count,
        originalContent,
        tone: dto.tone || TweetTone.PROFESSIONAL,
      },
      identity.organizationId,
    );
    const brief = await this.resolveThreadBrief(
      originalPost,
      originalContent,
      identity,
    );
    const prompt = [
      template,
      `Brand brief for this thread. Write every reply in this voice and follow its X thread craft and guardrails:\n${brief}`,
      'Keep the output format asked for above.',
    ].join('\n\n');
    const { input } = await this.promptBuilderService.buildPrompt(
      DEFAULT_MINI_TEXT_MODEL,
      {
        maxTokens: TEXT_GENERATION_LIMITS.postThreadExpansion,
        modelCategory: ModelCategory.TEXT,
        prompt,
        systemPromptTemplate: SystemPromptKey.TWITTER,
        temperature: 0.8,
        useTemplate: false,
      },
      identity.organizationId,
    );
    const content = await this.replicateService.generateTextCompletionSync(
      DEFAULT_MINI_TEXT_MODEL,
      input,
      byokApiKeyOverride,
    );

    if (!content) {
      throw new Error('No content generated from AI service');
    }

    return parsePostGenerationSlots(content, additionalCount, {
      constraints: TWITTER_THREAD_CONSTRAINTS,
    });
  }

  /**
   * Replies are written against the composed harness brief (brand voice, X
   * thread craft, guardrails), like posts, scripts and newsletters. A thread is
   * never expanded without it: an unresolved brief fails the request, and the
   * caller can retry, instead of letting a generic thread through.
   */
  private async resolveThreadBrief(
    originalPost: PostDocument,
    originalContent: string,
    identity: ThreadGenerationMetadata,
  ): Promise<string> {
    const brandId = originalPost.brandId
      ? String(originalPost.brandId)
      : identity.brandId;
    const brief = await this.harness.resolveBrief({
      brandId,
      contentType: 'thread',
      includeContentMemory: true,
      objective: 'engagement',
      organizationId: identity.organizationId,
      platform: 'twitter',
      topic: originalContent.slice(0, 200),
      userId: identity.userId,
    });
    const formatted = this.harness.formatBrief(brief).trim();
    if (
      !brief ||
      !formatted ||
      formatted.length > BRAND_CONTEXT_CHARACTER_BUDGET
    ) {
      this.logger.warn(`${this.constructor.name} harness brief unavailable`, {
        brandId,
        organizationId: identity.organizationId,
      });
      throw new ServiceUnavailableException(THREAD_BRAND_CONTEXT_UNAVAILABLE);
    }
    return formatted;
  }

  private async completeGeneratedChildren(
    childPosts: PostDocument[],
    tweetLines: Array<string | null>,
    identity: ThreadGenerationMetadata,
  ): Promise<number> {
    let completedCount = 0;
    for (let index = 0; index < childPosts.length; index++) {
      const child = childPosts[index];
      const tweetText = tweetLines[index];
      const childId = String(child.id);

      if (!tweetText) {
        await this.markChildFailed(
          childId,
          new Error('Insufficient tweets generated'),
        );
        continue;
      }

      try {
        // PostsService.patch owns collection/list/single cache-tag
        // invalidation for every status write.
        const updatedPost = await this.postsService.patch(
          childId,
          {
            description: tweetText,
            label: extractPostGenerationLabel(tweetText),
            targetExecutionState: TargetExecutionState.DRAFT,
          },
          [
            { path: 'ingredients', select: ['id', 'cdnUrl'] },
            {
              path: 'credential',
              select: ['id', 'label', 'externalHandle'],
            },
          ],
        );

        await this.websocketService.emit(WebSocketPaths.post(childId), {
          result: updatedPost,
          status: Status.COMPLETED,
        });
        await this.activityRecorder.record({
          brandId: identity.brandId,
          entityId: childId,
          entityModel: ActivityEntityModel.POST,
          key: ActivityKey.POST_GENERATED,
          organizationId: identity.organizationId,
          source: ActivitySource.POST_GENERATION,
          userId: identity.userId,
          value: childId,
        });
        completedCount++;
      } catch (error) {
        this.logger.error(
          `Failed to update expanded thread post ${childId}`,
          error,
        );
        await this.markChildFailed(childId, error);
      }
    }
    return completedCount;
  }

  private async markActivityFailed(
    activity: ActivityDocument | undefined,
    error: unknown,
  ): Promise<void> {
    if (!activity) {
      return;
    }

    try {
      await this.activityRecorder.update(activity, {
        key: ActivityKey.POST_FAILED,
        value: JSON.stringify({
          error: (error as Error)?.message || 'Thread expansion failed',
        }),
      });
    } catch (activityError) {
      this.logger.error(
        'Failed to mark activity as failed during thread expansion cleanup',
        activityError,
      );
    }
  }

  private async markChildFailed(postId: string, error: unknown): Promise<void> {
    try {
      // PostsService.patch owns collection/list/single cache-tag invalidation.
      await this.postsService.patch(postId, {
        targetExecutionState: TargetExecutionState.FAILED,
      });
      await this.websocketService.emit(WebSocketPaths.post(postId), {
        error: (error as Error)?.message || 'Generation failed',
        status: Status.FAILED,
      });
    } catch (patchError) {
      this.logger.error(
        `Failed to update post ${postId} to FAILED status`,
        patchError,
      );
    }
  }
}
