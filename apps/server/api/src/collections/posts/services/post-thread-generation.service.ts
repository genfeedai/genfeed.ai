import type { IAuthPublicMetadata } from '@api/auth/interfaces/authenticated-user.interface';
import { ActivityEntity } from '@api/collections/activities/entities/activity.entity';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { ExpandToThreadDto } from '@api/collections/posts/dto/expand-thread.dto';
import { TweetTone } from '@api/collections/posts/dto/generate-tweets.dto';
import type { PostDocument } from '@api/collections/posts/schemas/post.schema';
import {
  extractPostGenerationLabel,
  parsePostGenerationContent,
} from '@api/collections/posts/services/post-generation-text.util';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { TemplatesService } from '@api/collections/templates/services/templates.service';
import { DEFAULT_MINI_TEXT_MODEL } from '@api/constants/default-mini-text-model.constant';
import { TEXT_GENERATION_LIMITS } from '@api/constants/text-generation-limits.constant';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
  ModelCategory,
  PostStatus,
  PromptTemplateKey,
  Status,
  SystemPromptKey,
} from '@genfeedai/enums';
import type { AccountPublishingConstraints } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { ReplicateService } from '@server/services/integrations/replicate/services/replicate.service';

type ThreadGenerationMetadata = Pick<
  IAuthPublicMetadata,
  'brand' | 'organization' | 'user'
>;

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
    private readonly activitiesService: ActivitiesService,
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
    publicMetadata: ThreadGenerationMetadata,
  ): Promise<void> {
    let activity: Awaited<ReturnType<ActivitiesService['create']>> | undefined;

    try {
      activity = await this.activitiesService.create(
        new ActivityEntity({
          brand: publicMetadata.brand,
          key: ActivityKey.POST_PROCESSING,
          organization: publicMetadata.organization,
          source: ActivitySource.POST_GENERATION,
          user: publicMetadata.user,
          value: JSON.stringify({
            count: dto.count,
            originalPostId: String(originalPost.id),
            type: 'thread-expansion',
          }),
        }),
      );

      const additionalCount = dto.count - 1;
      const originalContent =
        originalPost.description?.replace(/<[^>]+>/g, ' ').trim() || '';
      const prompt = await this.templatesService.getRenderedPrompt(
        PromptTemplateKey.THREAD_EXPAND,
        {
          additionalCount,
          count: dto.count,
          originalContent,
          tone: dto.tone || TweetTone.PROFESSIONAL,
        },
        publicMetadata.organization,
      );
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
        publicMetadata.organization,
      );
      const content = await this.replicateService.generateTextCompletionSync(
        DEFAULT_MINI_TEXT_MODEL,
        input,
      );

      if (!content) {
        throw new Error('No content generated from AI service');
      }

      const tweetLines = parsePostGenerationContent(content, additionalCount, {
        constraints: TWITTER_THREAD_CONSTRAINTS,
      });

      await this.completeGeneratedChildren(
        childPosts,
        tweetLines,
        publicMetadata,
      );
    } catch (error) {
      this.logger.error('Failed to expand thread asynchronously', error);
      await this.markActivityFailed(activity, error);

      for (const child of childPosts) {
        await this.markChildFailed(String(child.id), error);
      }
    }
  }

  private async completeGeneratedChildren(
    childPosts: PostDocument[],
    tweetLines: string[],
    publicMetadata: ThreadGenerationMetadata,
  ): Promise<void> {
    for (let index = 0; index < childPosts.length; index++) {
      const child = childPosts[index];
      const tweetText = tweetLines[index];
      const childId = String(child.id);

      // The parser removes empty strings, so a missing value only represents
      // an unresolved tail child when the provider returned too few replies.
      if (!tweetText) {
        await this.markChildFailed(
          childId,
          new Error('Insufficient tweets generated'),
        );
        continue;
      }

      try {
        const updatedPost = await this.postsService.patch(
          childId,
          {
            description: tweetText,
            label: extractPostGenerationLabel(tweetText),
            status: PostStatus.DRAFT,
          },
          [
            { path: 'ingredients', select: '_id url' },
            { path: 'credential', select: '_id label handle' },
          ],
        );

        await this.websocketService.emit(WebSocketPaths.post(childId), {
          result: updatedPost,
          status: Status.COMPLETED,
        });
        await this.activitiesService.create(
          new ActivityEntity({
            brand: publicMetadata.brand,
            entityId: childId,
            entityModel: ActivityEntityModel.POST,
            key: ActivityKey.POST_GENERATED,
            organization: publicMetadata.organization,
            source: ActivitySource.POST_GENERATION,
            user: publicMetadata.user,
            value: childId,
          }),
        );
      } catch (error) {
        this.logger.error(
          `Failed to update expanded thread post ${childId}`,
          error,
        );
        await this.markChildFailed(childId, error);
      }
    }
  }

  private async markActivityFailed(
    activity: Awaited<ReturnType<ActivitiesService['create']>> | undefined,
    error: unknown,
  ): Promise<void> {
    if (!activity) {
      return;
    }

    try {
      await this.activitiesService.patch(activity.id.toString(), {
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
      await this.postsService.patch(postId, { status: PostStatus.FAILED });
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
