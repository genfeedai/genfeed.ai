import { ActivityEntity } from '@api/collections/activities/entities/activity.entity';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import type { IngredientRefDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { BatchScheduleDto } from '@api/collections/posts/dto/batch-schedule.dto';
import { CreatePostDto } from '@api/collections/posts/dto/create-post.dto';
import { CreateRemixPostDto } from '@api/collections/posts/dto/create-remix-post.dto';
import { EnhancePostDto } from '@api/collections/posts/dto/enhance-post.dto';
import { ExpandToThreadDto } from '@api/collections/posts/dto/expand-thread.dto';
import { GenerateHooksDto } from '@api/collections/posts/dto/generate-hooks.dto';
import { GenerateThreadDto } from '@api/collections/posts/dto/generate-thread.dto';
import {
  GenerateTweetsDto,
  TweetTone,
} from '@api/collections/posts/dto/generate-tweets.dto';
import { type PostDocument } from '@api/collections/posts/schemas/post.schema';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { TemplatesService } from '@api/collections/templates/services/templates.service';
import { TrendReferenceCorpusService } from '@api/collections/trends/services/trend-reference-corpus.service';
import { ConfigService } from '@api/config/config.service';
import { DEFAULT_MINI_TEXT_MODEL } from '@api/constants/default-mini-text-model.constant';
import { TEXT_GENERATION_LIMITS } from '@api/constants/text-generation-limits.constant';
import { Credits } from '@api/helpers/decorators/credits/credits.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import {
  returnBadRequest,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { QuotaService } from '@api/services/quota/quota.service';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import type { User } from '@clerk/backend';
import {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
  CredentialPlatform,
  IngredientCategory,
  ModelCategory,
  PostCategory,
  PostStatus,
  PromptTemplateKey,
  Status,
  SystemPromptKey,
} from '@genfeedai/enums';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/interfaces';
import { PostListSerializer, PostSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('posts')
@UseGuards(RolesGuard)
export class PostsOperationsController {
  private readonly serializer = PostSerializer;

  constructor(
    private readonly activitiesService: ActivitiesService,
    private readonly configService: ConfigService,
    private readonly credentialsService: CredentialsService,
    private readonly ingredientsService: IngredientsService,
    private readonly logger: LoggerService,
    private readonly postsService: PostsService,
    private readonly promptBuilderService: PromptBuilderService,
    private readonly quotaService: QuotaService,
    private readonly replicateService: ReplicateService,
    private readonly templatesService: TemplatesService,
    private readonly trendReferenceCorpusService: TrendReferenceCorpusService,
    private readonly websocketService: NotificationsPublisherService,
  ) {}

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Strip HTML tags from a string for character counting
   */
  private stripHtmlTags(html: string): string {
    return html.replace(/<[^>]+>/g, '');
  }

  /**
   * Validate post length (max 500 chars without HTML tags)
   */
  private isValidPostLength(postHtml: string, maxLength = 560): boolean {
    const textOnly = this.stripHtmlTags(postHtml);
    return textOnly.length > 0 && textOnly.length <= maxLength;
  }

  /**
   * Parse AI-generated content into an array of tweets
   * Handles JSON arrays and fallback to marker-based splitting
   */
  private parseTweetContent(content: string, maxCount: number): string[] {
    let tweetLines: string[] = [];

    try {
      // Try to parse as JSON array first
      const trimmedContent = content
        .trim()
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

      const parsed = JSON.parse(trimmedContent);
      if (Array.isArray(parsed)) {
        tweetLines = parsed
          .map((post: unknown) => String(post).trim())
          .filter(
            (post: string) => post.length > 0 && this.isValidPostLength(post),
          )
          .slice(0, maxCount);
      }
    } catch {
      // Fallback to marker-based splitting (---)
      const posts = content
        .split('---')
        .map((post) => post.trim())
        .filter((post) => post.length > 0 && this.isValidPostLength(post))
        .slice(0, maxCount);

      if (posts.length > 0) {
        tweetLines = posts;
      } else {
        // Last resort: split by double newline
        tweetLines = content
          .split(/\n\n+/)
          .map((post) => post.trim())
          .filter((post) => post.length > 0 && this.isValidPostLength(post))
          .slice(0, maxCount);
      }
    }

    return tweetLines;
  }

  private buildRemixMetadata(
    dto: Pick<
      GenerateTweetsDto,
      'sourceReferenceIds' | 'sourceUrl' | 'trendId'
    >,
  ): Record<string, unknown> | undefined {
    const metadata: Record<string, unknown> = {};

    if (dto.sourceReferenceIds?.length) {
      metadata.sourceReferenceIds = dto.sourceReferenceIds.map((id) =>
        String(id),
      );
    }

    if (dto.sourceUrl) {
      metadata.sourceUrl = dto.sourceUrl;
    }

    if (dto.trendId) {
      metadata.trendId = String(dto.trendId);
      metadata.trendIds = [String(dto.trendId)];
    }

    return Object.keys(metadata).length > 0 ? metadata : undefined;
  }

  private getRefId(
    ref: string | IngredientRefDocument | null | undefined,
  ): string | undefined {
    if (typeof ref === 'string') {
      return ref;
    }

    return ref?._id?.toString() ?? ref?.id?.toString();
  }

  private getBadRequestResponse(
    response: unknown,
  ): string | Record<string, unknown> {
    return typeof response === 'string'
      ? response
      : typeof response === 'object' && response !== null
        ? (response as Record<string, unknown>)
        : { detail: 'Bad request' };
  }

  private normalizeCredentialPlatform(
    value: unknown,
  ): CredentialPlatform | undefined {
    return Object.values(CredentialPlatform).find(
      (platform) => platform === value,
    );
  }

  private normalizeIngredientCategory(
    value: unknown,
  ): IngredientCategory | undefined {
    return Object.values(IngredientCategory).find(
      (category) => category === value,
    );
  }

  private isTwitterPlatform(value: unknown): boolean {
    return (
      this.normalizeCredentialPlatform(value) === CredentialPlatform.TWITTER
    );
  }

  private getPostCategoryFromIngredient(
    ingredient: {
      category?: unknown;
    } | null,
  ): PostCategory {
    switch (this.normalizeIngredientCategory(ingredient?.category)) {
      case IngredientCategory.IMAGE:
        return PostCategory.IMAGE;
      case IngredientCategory.VIDEO:
        return PostCategory.VIDEO;
      default:
        return PostCategory.TEXT;
    }
  }

  private async recordGeneratedPostLineage(params: {
    dto: Pick<
      GenerateTweetsDto,
      'sourceReferenceIds' | 'sourceUrl' | 'trendId'
    >;
    draftType: 'thread' | 'tweet';
    platform: CredentialPlatform;
    postId: string;
    publicMetadata: { brand: string; organization: string };
    prompt: string;
  }): Promise<void> {
    const metadata = this.buildRemixMetadata(params.dto);

    if (!metadata) {
      return;
    }

    await this.trendReferenceCorpusService.recordDraftRemixLineage({
      brandId: params.publicMetadata.brand,
      draftType: params.draftType,
      generatedBy: 'posts-generation',
      metadata,
      organizationId: params.publicMetadata.organization,
      platforms: [params.platform],
      postId: params.postId,
      prompt: params.prompt,
    });
  }

  // ============================================================================
  // ENDPOINTS
  // ============================================================================

  @Post('generations')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async generateTweets(
    @Req() request: Request,
    @Body() dto: GenerateTweetsDto,
    @CurrentUser() user: User,
  ) {
    const publicMetadata = getPublicMetadata(user);

    try {
      // Validate credential
      const credential = await this.credentialsService.findOne({
        _id: dto.credential,
        isConnected: true,
        isDeleted: false,
        organization: publicMetadata.organization,
      });

      if (!credential) {
        throw new HttpException(
          {
            detail:
              'The specified credential does not exist or is not connected',
            title: 'Credential not found',
          },
          HttpStatus.NOT_FOUND,
        );
      }

      // Create posts immediately with PROCESSING status
      const createdPosts = [];
      const groupId = '507f191e810c19729de860ee'.toString();

      // Create placeholder posts with PROCESSING status
      for (let i = 0; i < dto.count; i++) {
        const createPostDto: CreatePostDto = {
          credential: dto.credential,
          description: 'Generating...', // Placeholder - will be filled when generation completes
          groupId,
          ingredients: [],
          label: '',
          status: PostStatus.PROCESSING,
        };

        const post = await this.postsService.create({
          ...createPostDto,
          brand: publicMetadata.brand,
          category: PostCategory.TEXT, // AI-generated tweets are text-only
          organization: publicMetadata.organization,
          platform: CredentialPlatform.TWITTER,
          user: publicMetadata.user,
        });

        createdPosts.push(post);
      }

      // Return immediately with PROCESSING posts
      const response = serializeCollection(request, PostListSerializer, {
        docs: createdPosts,
      });

      // Continue async generation in background
      this.generateTweetsAsync(dto, createdPosts, publicMetadata).catch(
        (error) => {
          this.logger.error('Failed to generate tweets asynchronously', error);
        },
      );

      return response;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error('Failed to generate tweets', error);
      throw new HttpException(
        {
          detail:
            (error as Error)?.message ||
            'An error occurred while generating tweets',
          title: 'Failed to generate tweets',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('thread-generations')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async generateThread(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() dto: GenerateThreadDto,
  ): Promise<JsonApiCollectionResponse> {
    const publicMetadata = getPublicMetadata(user);

    try {
      // Validate credential
      const credential = await this.credentialsService.findOne({
        _id: dto.credential,
        isConnected: true,
        isDeleted: false,
        organization: publicMetadata.organization,
      });

      if (!credential) {
        throw new HttpException(
          {
            detail:
              'The specified credential does not exist or is not connected',
            title: 'Credential not found',
          },
          HttpStatus.NOT_FOUND,
        );
      }

      // Create placeholder posts with PROCESSING status, linked as thread
      const createdPosts = [];
      const groupId = '507f191e810c19729de860ee'.toString();

      let rootPostId: string | undefined;

      for (let i = 0; i < dto.count; i++) {
        const post = await this.postsService.create({
          brand: publicMetadata.brand,
          category: PostCategory.TEXT,
          credential: dto.credential,
          description: 'Generating...',
          groupId,
          ingredients: [],
          label: '',
          order: i,
          organization: publicMetadata.organization,
          parent: i === 0 ? undefined : rootPostId,
          platform: CredentialPlatform.TWITTER,
          status: PostStatus.PROCESSING,
          user: publicMetadata.user,
        });

        createdPosts.push(post);

        // Store root post ID after creating first post
        if (i === 0) {
          rootPostId = post._id as string;
        }
      }

      // Return immediately with PROCESSING posts
      const response = serializeCollection(request, PostListSerializer, {
        docs: createdPosts,
      });

      // Continue async generation in background
      this.generateThreadAsync(dto, createdPosts, publicMetadata).catch(
        (error) => {
          this.logger.error('Failed to generate thread asynchronously', error);
        },
      );

      return response;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error('Failed to generate thread', error);
      throw new HttpException(
        {
          detail:
            (error as Error)?.message ||
            'An error occurred while generating thread',
          title: 'Failed to generate thread',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Expand an existing post into a Twitter/X thread
   * Original post becomes first tweet, AI generates additional tweets that expand on the content
   */
  @Post(':postId/thread-expansions')
  @Credits({
    description: 'Thread expansion (text model)',
    modelKey: DEFAULT_MINI_TEXT_MODEL,
    source: ActivitySource.POST_ENHANCEMENT,
  })
  @UseGuards(SubscriptionGuard, CreditsGuard)
  @UseInterceptors(CreditsInterceptor)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async expandToThread(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('postId') postId: string,
    @Body() dto: ExpandToThreadDto,
  ): Promise<JsonApiCollectionResponse> {
    const publicMetadata = getPublicMetadata(user);

    // Verify post exists and belongs to user's org
    const originalPost = await this.postsService.findOne({ _id: postId }, [
      PopulatePatterns.ingredientsMinimal,
      PopulatePatterns.credentialMinimal,
    ]);

    if (!originalPost) {
      throw new HttpException(
        {
          detail: 'The specified post does not exist',
          title: 'Post not found',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    if (originalPost.organization.toString() !== publicMetadata.organization) {
      throw new HttpException(
        {
          detail: 'You do not have access to this post',
          title: 'Access denied',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    // Check if post already has children (is already a thread)
    const existingChildren = await this.postsService.count({
      isDeleted: false,
      parent: postId,
    });

    if (existingChildren > 0) {
      throw new HttpException(
        {
          detail:
            'This post already has thread children. Cannot expand further.',
          title: 'Already a thread',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // Verify it's a Twitter/X post
    if (!this.isTwitterPlatform(originalPost.platform)) {
      throw new HttpException(
        {
          detail: 'Thread expansion is only available for Twitter/X posts',
          title: 'Platform not supported',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // Create placeholder child posts with PROCESSING status
    const createdPosts: PostDocument[] = [originalPost]; // Include original as first
    const additionalCount = dto.count - 1;

    for (let i = 0; i < additionalCount; i++) {
      const childPost = await this.postsService.create({
        brand: publicMetadata.brand,
        category: PostCategory.TEXT,
        credential: originalPost.credential as string,
        description: 'Generating...',
        ingredients: [],
        label: '',
        order: i + 1, // Original is order 0
        organization: publicMetadata.organization,
        parent: postId,
        platform: CredentialPlatform.TWITTER,
        status: PostStatus.PROCESSING,
        user: publicMetadata.user,
      });
      createdPosts.push(childPost);
    }

    // Return immediately with all posts (original + processing children)
    const response = serializeCollection(request, PostListSerializer, {
      docs: createdPosts,
    });

    // Continue async generation in background
    this.expandThreadAsync(
      originalPost,
      createdPosts.slice(1), // Only the new children
      dto,
      publicMetadata,
    ).catch((error) => {
      this.logger.error('Failed to expand thread asynchronously', error);
    });

    return response;
  }

  /**
   * Async method to expand thread and update child posts
   */
  private async expandThreadAsync(
    originalPost: PostDocument,
    childPosts: PostDocument[],
    dto: ExpandToThreadDto,
    publicMetadata: { user: string; organization: string; brand: string },
  ): Promise<void> {
    // Create PROCESSING activity at start
    const activity = await this.activitiesService.create(
      new ActivityEntity({
        brand: publicMetadata.brand,
        key: ActivityKey.POST_PROCESSING,
        organization: publicMetadata.organization,
        source: ActivitySource.POST_GENERATION,
        user: publicMetadata.user,
        value: JSON.stringify({
          count: dto.count,
          originalPostId: String(originalPost._id),
          type: 'thread-expansion',
        }),
      }),
    );

    try {
      const tone = dto.tone || TweetTone.PROFESSIONAL;
      const additionalCount = dto.count - 1;

      // Strip HTML for prompt (AI sees plain text)
      const originalContent =
        originalPost.description?.replace(/<[^>]+>/g, ' ').trim() || '';

      const prompt = await this.templatesService.getRenderedPrompt(
        PromptTemplateKey.THREAD_EXPAND,
        {
          additionalCount,
          count: dto.count,
          originalContent,
          tone,
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

      // Parse content into tweet lines using helper
      const tweetLines = this.parseTweetContent(content, additionalCount);

      // Update child posts with generated content
      for (let i = 0; i < childPosts.length && i < tweetLines.length; i++) {
        const child = childPosts[i];
        const tweetText = tweetLines[i];
        const childId = String(child._id);

        try {
          const updatedPost = await this.postsService.patch(
            childId,
            {
              description: tweetText,
              label: this.extractLabelFromTweet(tweetText),
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

          // Create POST_GENERATED activity for this post
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
          await this.handleExpandPostFailure(childId, error);
        }
      }

      // Handle insufficient tweets generated
      for (let i = tweetLines.length; i < childPosts.length; i++) {
        const childId = String(childPosts[i]._id);
        await this.handleExpandPostFailure(
          childId,
          new Error('Insufficient tweets generated'),
        );
      }
    } catch (error) {
      this.logger.error('Failed to expand thread asynchronously', error);

      // Update activity to FAILED
      await this.activitiesService.patch(activity._id.toString(), {
        key: ActivityKey.POST_FAILED,
        value: JSON.stringify({
          error: (error as Error)?.message || 'Thread expansion failed',
        }),
      });

      for (const child of childPosts) {
        await this.handleExpandPostFailure(String(child._id), error);
      }
    }
  }

  /**
   * Helper to handle post failure during thread expansion
   */
  private async handleExpandPostFailure(
    postId: string,
    error: unknown,
  ): Promise<void> {
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

  /**
   * Extract a label from tweet text (first ~50 characters, truncated at word boundary)
   */
  private extractLabelFromTweet(
    tweetText: string,
    maxLength: number = 50,
  ): string {
    if (!tweetText || tweetText.trim().length === 0) {
      return '';
    }

    // Strip HTML tags for label extraction
    const textOnly = tweetText.replace(/<[^>]+>/g, ' ').trim();
    // Normalize whitespace
    const normalized = textOnly.replace(/\s+/g, ' ');

    if (normalized.length <= maxLength) {
      return normalized;
    }

    // Truncate at word boundary
    const truncated = normalized.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');

    if (lastSpace > maxLength * 0.7) {
      // If we found a space reasonably close to maxLength, use it
      return `${truncated.substring(0, lastSpace)}...`;
    }

    // Otherwise truncate at maxLength
    return `${truncated}...`;
  }

  /**
   * Async method to generate tweets and update posts
   * This runs in the background after posts are created with PROCESSING status
   */
  private async generateTweetsAsync(
    dto: GenerateTweetsDto,
    createdPosts: PostDocument[],
    publicMetadata: { user: string; organization: string; brand: string },
  ): Promise<void> {
    // Create PROCESSING activity at start
    const activity = await this.activitiesService.create(
      new ActivityEntity({
        brand: publicMetadata.brand,
        key: ActivityKey.POST_PROCESSING,
        organization: publicMetadata.organization,
        source: ActivitySource.POST_GENERATION,
        user: publicMetadata.user,
        value: JSON.stringify({
          count: dto.count,
          topic: dto.topic?.substring(0, 100),
          type: 'tweet-generation',
        }),
      }),
    );

    try {
      // Generate tweets using template from database
      const prompt = await this.templatesService.getRenderedPrompt(
        PromptTemplateKey.TWEET_GENERATION,
        {
          count: dto.count,
          tone: dto.tone || 'professional',
          topic: dto.topic,
        },
        publicMetadata.organization,
      );

      // Generate tweets using PromptBuilderService + Replicate LLM
      const { input } = await this.promptBuilderService.buildPrompt(
        DEFAULT_MINI_TEXT_MODEL,
        {
          maxTokens: TEXT_GENERATION_LIMITS.postTweetGeneration,
          modelCategory: ModelCategory.TEXT,
          prompt: prompt,
          systemPromptTemplate: SystemPromptKey.TWEET,
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

      // Parse the generated tweets (one per line)
      const tweetLines = content
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && line.length <= 280)
        .slice(0, dto.count);

      // Update each post with generated content and set to DRAFT
      for (let i = 0; i < createdPosts.length && i < tweetLines.length; i++) {
        const post = createdPosts[i];
        const tweetText = tweetLines[i];
        const postId = String(post._id);

        try {
          const updatedPost = await this.postsService.patch(
            postId,
            {
              description: tweetText,
              label: this.extractLabelFromTweet(tweetText),
              status: PostStatus.DRAFT,
            },
            [
              { path: 'ingredients', select: '_id url' },
              { path: 'credential', select: '_id label handle' },
            ],
          );

          // Emit WebSocket event for successful generation
          await this.websocketService.emit(WebSocketPaths.post(postId), {
            result: updatedPost,
            status: Status.COMPLETED,
          });

          // Create POST_GENERATED activity for this post
          await this.activitiesService.create(
            new ActivityEntity({
              brand: publicMetadata.brand,
              entityId: postId,
              entityModel: ActivityEntityModel.POST,
              key: ActivityKey.POST_GENERATED,
              organization: publicMetadata.organization,
              source: ActivitySource.POST_GENERATION,
              user: publicMetadata.user,
              value: postId,
            }),
          );

          try {
            await this.recordGeneratedPostLineage({
              draftType: 'tweet',
              dto,
              platform: CredentialPlatform.TWITTER,
              postId,
              prompt: dto.topic,
              publicMetadata,
            });
          } catch (lineageError) {
            this.logger.warn('Failed to record tweet remix lineage', {
              error:
                lineageError instanceof Error
                  ? lineageError.message
                  : String(lineageError),
              postId,
            });
          }
        } catch (error) {
          this.logger.error(`Failed to update post ${postId}`, error);

          // Update post to FAILED status
          try {
            await this.postsService.patch(postId, {
              status: PostStatus.FAILED,
            });

            // Emit WebSocket event for failure
            await this.websocketService.emit(WebSocketPaths.post(postId), {
              error: (error as Error)?.message || 'An error occurred',
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

      // Handle case where fewer tweets were generated than requested
      if (tweetLines.length < createdPosts.length) {
        for (let i = tweetLines.length; i < createdPosts.length; i++) {
          const post = createdPosts[i];
          const postId = String(post._id);

          try {
            await this.postsService.patch(postId, {
              status: PostStatus.FAILED,
            });

            await this.websocketService.emit(WebSocketPaths.post(postId), {
              error: 'Insufficient tweets generated',
              status: Status.FAILED,
            });
          } catch (error) {
            this.logger.error(
              `Failed to update post ${postId} to FAILED status`,
              error,
            );
          }
        }
      }
    } catch (error) {
      this.logger.error('Failed to generate tweets asynchronously', error);

      // Update activity to FAILED
      await this.activitiesService.patch(activity._id.toString(), {
        key: ActivityKey.POST_FAILED,
        value: JSON.stringify({
          error: (error as Error)?.message || 'Generation failed',
        }),
      });

      // Mark all posts as FAILED if generation completely fails
      for (const post of createdPosts) {
        const postId = String(post._id);
        try {
          await this.postsService.patch(postId, {
            status: PostStatus.FAILED,
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
  }

  /**
   * Async method to generate thread content and update posts
   * This runs in the background after posts are created with PROCESSING status
   */
  private async generateThreadAsync(
    dto: GenerateThreadDto,
    createdPosts: PostDocument[],
    publicMetadata: { user: string; organization: string; brand: string },
  ): Promise<void> {
    // Create PROCESSING activity at start
    const activity = await this.activitiesService.create(
      new ActivityEntity({
        brand: publicMetadata.brand,
        key: ActivityKey.POST_PROCESSING,
        organization: publicMetadata.organization,
        source: ActivitySource.POST_GENERATION,
        user: publicMetadata.user,
        value: JSON.stringify({
          count: dto.count,
          topic: dto.topic?.substring(0, 100),
          type: 'thread-generation',
        }),
      }),
    );

    try {
      // Generate thread using template from database
      const tone = dto.tone || TweetTone.PROFESSIONAL;

      const prompt = await this.templatesService.getRenderedPrompt(
        PromptTemplateKey.THREAD_GENERATION,
        {
          count: dto.count,
          tone: tone,
          topic: dto.topic,
        },
        publicMetadata.organization,
      );

      // Generate thread using PromptBuilderService + Replicate LLM
      const { input } = await this.promptBuilderService.buildPrompt(
        DEFAULT_MINI_TEXT_MODEL,
        {
          maxTokens: TEXT_GENERATION_LIMITS.postThreadGeneration,
          modelCategory: ModelCategory.TEXT,
          prompt: prompt,
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

      // Parse content into tweet lines using helper
      const tweetLines = this.parseTweetContent(content, dto.count);

      // Update each post with generated content and set to DRAFT
      for (let i = 0; i < createdPosts.length && i < tweetLines.length; i++) {
        const post = createdPosts[i];
        const tweetText = tweetLines[i];
        const postId = String(post._id);

        try {
          const updatedPost = await this.postsService.patch(
            postId,
            {
              description: tweetText,
              label: this.extractLabelFromTweet(tweetText),
              status: PostStatus.DRAFT,
            },
            [
              { path: 'ingredients', select: '_id url' },
              { path: 'credential', select: '_id label handle' },
            ],
          );

          // Emit WebSocket event for successful generation
          await this.websocketService.emit(WebSocketPaths.post(postId), {
            result: updatedPost,
            status: Status.COMPLETED,
          });

          // Create POST_GENERATED activity for this post
          await this.activitiesService.create(
            new ActivityEntity({
              brand: publicMetadata.brand,
              entityId: postId,
              entityModel: ActivityEntityModel.POST,
              key: ActivityKey.POST_GENERATED,
              organization: publicMetadata.organization,
              source: ActivitySource.POST_GENERATION,
              user: publicMetadata.user,
              value: postId,
            }),
          );

          try {
            await this.recordGeneratedPostLineage({
              draftType: 'thread',
              dto,
              platform: CredentialPlatform.TWITTER,
              postId,
              prompt: dto.topic,
              publicMetadata,
            });
          } catch (lineageError) {
            this.logger.warn('Failed to record thread remix lineage', {
              error:
                lineageError instanceof Error
                  ? lineageError.message
                  : String(lineageError),
              postId,
            });
          }
        } catch (error) {
          this.logger.error(`Failed to update thread post ${postId}`, error);

          // Update post to FAILED status
          try {
            await this.postsService.patch(postId, {
              status: PostStatus.FAILED,
            });

            // Emit WebSocket event for failure
            await this.websocketService.emit(WebSocketPaths.post(postId), {
              error: (error as Error)?.message || 'An error occurred',
              status: Status.FAILED,
            });
          } catch (patchError) {
            this.logger.error(
              `Failed to update thread post ${postId} to FAILED status`,
              patchError,
            );
          }
        }
      }

      // Handle case where fewer tweets were generated than requested
      if (tweetLines.length < createdPosts.length) {
        for (let i = tweetLines.length; i < createdPosts.length; i++) {
          const post = createdPosts[i];
          const postId = String(post._id);

          try {
            await this.postsService.patch(postId, {
              status: PostStatus.FAILED,
            });

            await this.websocketService.emit(WebSocketPaths.post(postId), {
              error: 'Insufficient tweets generated for thread',
              status: Status.FAILED,
            });
          } catch (error) {
            this.logger.error(
              `Failed to update thread post ${postId} to FAILED status`,
              error,
            );
          }
        }
      }
    } catch (error) {
      this.logger.error('Failed to generate thread asynchronously', error);

      // Update activity to FAILED
      await this.activitiesService.patch(activity._id.toString(), {
        key: ActivityKey.POST_FAILED,
        value: JSON.stringify({
          error: (error as Error)?.message || 'Thread generation failed',
        }),
      });

      // Mark all posts as FAILED if generation completely fails
      for (const post of createdPosts) {
        const postId = String(post._id);
        try {
          await this.postsService.patch(postId, {
            status: PostStatus.FAILED,
          });

          await this.websocketService.emit(WebSocketPaths.post(postId), {
            error: (error as Error)?.message || 'Thread generation failed',
            status: Status.FAILED,
          });
        } catch (patchError) {
          this.logger.error(
            `Failed to update thread post ${postId} to FAILED status`,
            patchError,
          );
        }
      }
    }
  }

  @Post('schedules/batch')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async batchSchedule(
    @Req() request: Request,
    @Body() dto: BatchScheduleDto,
    @CurrentUser() user: User,
  ) {
    const publicMetadata = getPublicMetadata(user);

    try {
      // Validate credential
      const credential = await this.credentialsService.findOne({
        _id: dto.credential,
        isConnected: true,
        isDeleted: false,
        organization: publicMetadata.organization,
      });

      if (!credential) {
        throw new HttpException(
          {
            detail:
              'The specified credential does not exist or is not connected',
            title: 'Credential not found',
          },
          HttpStatus.NOT_FOUND,
        );
      }

      // Update existing posts to SCHEDULED status
      const updatedPosts = [];

      // Batch fetch all posts and ingredients upfront (avoids N+1 queries)
      const postIds = dto.tweets.map((t) => t.postId);
      const ingredientIds = dto.tweets
        .filter((t) => t.ingredientId)
        .map((t) => t.ingredientId as string);

      const [posts, ingredients] = await Promise.all([
        this.postsService.findByIds(postIds, publicMetadata.organization),
        ingredientIds.length > 0
          ? this.ingredientsService.findByIds(
              ingredientIds,
              publicMetadata.organization,
            )
          : Promise.resolve([]),
      ]);

      // Create lookup maps for O(1) access
      const postMap = new Map(posts.map((p) => [p._id.toString(), p]));
      const ingredientSet = new Set(ingredients.map((i) => i._id.toString()));

      for (const tweet of dto.tweets) {
        // Find the post from pre-fetched data
        const post = postMap.get(tweet.postId.toString());

        if (!post) {
          this.logger.warn(`Post ${tweet.postId} not found, skipping`);
          continue;
        }

        const tweetIngredientIds: string[] = [];
        if (tweet.ingredientId && ingredientSet.has(tweet.ingredientId)) {
          tweetIngredientIds.push(tweet.ingredientId);
        }

        // Update post to SCHEDULED with scheduledDate
        const postIdString = String(tweet.postId);
        const updatedPost = await this.postsService.patch(
          postIdString,
          {
            category:
              tweetIngredientIds.length > 0 ? PostCategory.IMAGE : undefined,
            description: tweet.text,
            ingredients: tweetIngredientIds,
            scheduledDate: new Date(tweet.scheduledDate),
            status: PostStatus.SCHEDULED,
            timezone: tweet.timezone,
          },
          [
            { path: 'ingredients', select: '_id url' },
            { path: 'credential', select: '_id label handle' },
          ],
        );

        updatedPosts.push(updatedPost);

        // Create activity
        await this.activitiesService.create(
          new ActivityEntity({
            brand: publicMetadata.brand,
            entityId: updatedPost._id,
            entityModel: ActivityEntityModel.POST,
            key: ActivityKey.VIDEO_SCHEDULED,
            organization: publicMetadata.organization,
            source: ActivitySource.SCRIPT,
            user: publicMetadata.user,
            value: (updatedPost._id as string).toString(),
          }),
        );
      }

      return serializeCollection(request, PostListSerializer, {
        docs: updatedPosts,
      });
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error('Failed to batch schedule tweets', error);
      throw new HttpException(
        {
          detail:
            (error as Error)?.message ||
            'An error occurred while scheduling tweets',
          title: 'Failed to schedule tweets',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post(':postId/replies')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async addThreadReply(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('postId') postId: string,
    @Body() createPostDto: CreatePostDto,
  ): Promise<JsonApiSingleResponse> {
    const publicMetadata = getPublicMetadata(user);
    const parentId = postId;

    try {
      const parentPost = await this.postsService.findOne({ _id: parentId });

      if (!parentPost) {
        throw new HttpException(
          {
            detail: 'Parent post not found',
            title: `Parent post ${parentId} not found`,
          },
          HttpStatus.NOT_FOUND,
        );
      }

      if (
        parentPost.organization.toString() !==
        publicMetadata.organization.toString()
      ) {
        throw new HttpException(
          {
            detail: 'You do not have access to this post',
            title: 'Access denied',
          },
          HttpStatus.FORBIDDEN,
        );
      }

      const credential = await this.credentialsService.findOne({
        _id: createPostDto.credential,
        isConnected: true,
        isDeleted: false,
        organization: publicMetadata.organization,
      });

      if (!credential) {
        throw new HttpException(
          {
            detail: 'Credential not found',
            title: `Credential ${createPostDto.credential.toString()} not found`,
          },
          HttpStatus.NOT_FOUND,
        );
      }

      const credentialPlatform = this.normalizeCredentialPlatform(
        credential.platform,
      );
      if (!credentialPlatform) {
        throw new HttpException(
          {
            detail: 'Unsupported credential platform',
            title: 'Platform not supported',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      // Validate TEXT category only allowed for Twitter when scheduling
      if (
        createPostDto.status === PostStatus.SCHEDULED &&
        createPostDto.category === PostCategory.TEXT &&
        credentialPlatform !== CredentialPlatform.TWITTER
      ) {
        throw new HttpException(
          {
            detail: `${credential.platform} requires media when scheduling. Please add at least one image or video.`,
            title: 'Text-only posts not supported',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      // Validate ingredients required when scheduling for non-Twitter platforms
      if (
        createPostDto.status === PostStatus.SCHEDULED &&
        credentialPlatform !== CredentialPlatform.TWITTER
      ) {
        if (
          !createPostDto.ingredients ||
          createPostDto.ingredients.length === 0
        ) {
          throw new HttpException(
            {
              detail: `${credential.platform} requires at least one image or video when scheduling.`,
              title: 'Media required when scheduling',
            },
            HttpStatus.BAD_REQUEST,
          );
        }
      }

      let firstIngredient = null;
      const ingredientIds: string[] = [];

      if (createPostDto.ingredients && createPostDto.ingredients.length > 0) {
        for (const ingredientId of createPostDto.ingredients) {
          const ingredient = await this.ingredientsService.findOne({
            _id: ingredientId,
            isDeleted: false,
            organization: publicMetadata.organization,
          });

          if (!ingredient) {
            throw new HttpException(
              {
                detail:
                  'Ingredient not found or does not belong to your organization',
                title: `Ingredient ${ingredientId.toString()} not found`,
              },
              HttpStatus.NOT_FOUND,
            );
          }

          ingredientIds.push(ingredientId);

          if (!firstIngredient) {
            firstIngredient = ingredient;
          }
        }
      }

      await this.quotaService.verifyQuota(
        credential,
        publicMetadata.organization,
      );

      const data = await this.postsService.addThreadReply(parentId, {
        ...createPostDto,
        brand: this.getRefId(firstIngredient?.brand) ?? publicMetadata.brand,
        category:
          createPostDto.category ??
          this.getPostCategoryFromIngredient(firstIngredient),
        credential: createPostDto.credential,
        description: createPostDto.description || credential.description || '',
        ingredients: ingredientIds,
        label:
          createPostDto.label?.trim() ||
          credential.label ||
          (createPostDto.description?.trim()
            ? this.extractLabelFromTweet(createPostDto.description.trim())
            : ''),
        organization:
          this.getRefId(firstIngredient?.organization) ??
          publicMetadata.organization,
        platform: credentialPlatform,
        publicationDate: createPostDto.publicationDate,
        scheduledDate: createPostDto.scheduledDate,
        status: createPostDto.status,
        tags: createPostDto.tags || [],
        user: publicMetadata.user,
      });

      return serializeSingle(request, this.serializer, data);
    } catch (error: unknown) {
      if (error instanceof Error && 'response' in error) {
        return returnBadRequest(
          this.getBadRequestResponse((error as { response: unknown }).response),
        );
      }
      throw error;
    }
  }

  /**
   * Create a remix version of an existing post for A/B testing
   * Copies all properties from original post but with new description
   * Links to original post for KPI comparison
   */
  @Post(':postId/remixes')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async createRemixPost(
    @Req() request: Request,
    @Param('postId') postId: string,
    @Body() dto: CreateRemixPostDto,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    const publicMetadata = getPublicMetadata(user);

    try {
      // Verify the original post exists and user has access
      const originalPost = await this.postsService.findOne({ _id: postId }, [
        PopulatePatterns.ingredientsMinimal,
        PopulatePatterns.credentialMinimal,
      ]);

      if (!originalPost) {
        throw new HttpException(
          {
            detail: 'Original post not found',
            title: `Post ${postId} not found`,
          },
          HttpStatus.NOT_FOUND,
        );
      }

      if (
        originalPost.organization.toString() !==
        publicMetadata.organization.toString()
      ) {
        throw new HttpException(
          {
            detail: 'You do not have access to this post',
            title: 'Access denied',
          },
          HttpStatus.FORBIDDEN,
        );
      }

      // Create the remix post
      const remixPost = await this.postsService.createRemix(
        postId,
        dto.description,
        {
          brand: publicMetadata.brand,
          label: dto.label,
          organization: publicMetadata.organization,
          user: publicMetadata.user,
        },
      );

      // Create activity log
      await this.activitiesService.create(
        new ActivityEntity({
          brand: publicMetadata.brand,
          entityId: remixPost._id,
          entityModel: ActivityEntityModel.POST,
          key: ActivityKey.POST_CREATED,
          organization: publicMetadata.organization,
          source: ActivitySource.WEB,
          user: publicMetadata.user,
          value: (remixPost._id as string).toString(),
        }),
      );

      return serializeSingle(request, this.serializer, remixPost);
    } catch (error: unknown) {
      if (error instanceof Error && 'response' in error) {
        return returnBadRequest(
          this.getBadRequestResponse((error as { response: unknown }).response),
        );
      }
      throw error;
    }
  }

  /**
   * Enhance post description using AI
   * Takes a user prompt and uses AI to modify the post description accordingly
   */
  @Post(':postId/enhancements')
  @Credits({
    description: 'Post content enhancement (text model)',
    modelKey: DEFAULT_MINI_TEXT_MODEL,
    source: ActivitySource.POST_ENHANCEMENT,
  })
  @UseGuards(SubscriptionGuard, CreditsGuard)
  @UseInterceptors(CreditsInterceptor)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async enhancePost(
    @Req() request: Request,
    @Param('postId') postId: string,
    @Body() dto: EnhancePostDto,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    const publicMetadata = getPublicMetadata(user);

    // Fetch the post
    const post = await this.postsService.findOne({ _id: postId }, [
      PopulatePatterns.ingredientsMinimal,
      PopulatePatterns.credentialMinimal,
    ]);

    if (!post) {
      throw new HttpException(
        {
          detail: 'Post not found',
          title: `Post ${postId} not found`,
        },
        HttpStatus.NOT_FOUND,
      );
    }

    if (
      post.organization.toString() !== publicMetadata.organization.toString()
    ) {
      throw new HttpException(
        {
          detail: 'You do not have access to this post',
          title: 'Access denied',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    // Build prompt for AI enhancement
    const currentDescription = post.description || '';
    const platform = post.platform || 'social media';

    // Map platform to system prompt key
    const platformSystemPromptMap: Record<string, string> = {
      instagram: SystemPromptKey.INSTAGRAM,
      linkedin: SystemPromptKey.LINKEDIN,
      tiktok: SystemPromptKey.TIKTOK,
      twitter: SystemPromptKey.TWITTER,
      youtube: SystemPromptKey.YOUTUBE,
    };

    const systemPromptKey =
      platformSystemPromptMap[platform.toLowerCase()] ||
      SystemPromptKey.DEFAULT;

    try {
      // Get rendered prompt from template
      const prompt = await this.templatesService.getRenderedPrompt(
        PromptTemplateKey.POST_ENHANCEMENT,
        {
          currentDescription,
          platform,
          tone: dto.tone || 'professional',
          userRequest: dto.prompt,
        },
        publicMetadata.organization,
      );

      // Use PromptBuilderService to build prompt with templates and brand context
      const { input } = await this.promptBuilderService.buildPrompt(
        DEFAULT_MINI_TEXT_MODEL,
        {
          maxTokens: TEXT_GENERATION_LIMITS.postEnhancement,
          modelCategory: ModelCategory.TEXT,
          prompt: prompt,
          systemPromptTemplate: systemPromptKey,
          temperature: 0.8,
          useTemplate: false,
        },
        publicMetadata.organization,
      );

      const enhancedDescription =
        await this.replicateService.generateTextCompletionSync(
          DEFAULT_MINI_TEXT_MODEL,
          input,
        );

      // Update the post with enhanced description
      const updatedPost = await this.postsService.patch(postId, {
        description: enhancedDescription,
      });

      return serializeSingle(request, this.serializer, updatedPost);
    } catch (error: unknown) {
      const errorMessage = (error as Error)?.message || 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;

      this.logger.error(`Post enhancement failed: ${errorMessage}`, errorStack);
      throw new HttpException(
        {
          detail: errorMessage || 'Failed to enhance post content',
          title: 'Enhancement failed',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ============================================================================
  // HOOK VARIATIONS
  // ============================================================================

  @Post('hook-generations')
  @UseGuards(SubscriptionGuard, CreditsGuard)
  @UseInterceptors(CreditsInterceptor)
  // @ts-expect-error TS2345
  @Credits({ amount: 1, source: ActivitySource.IMAGE_GENERATION })
  @LogMethod({ logEnd: true, logError: true, logStart: true })
  async generateHookVariations(
    @CurrentUser() user: User,
    @Body() dto: GenerateHooksDto,
    @Req() _request: Request,
  ) {
    const _publicMetadata = getPublicMetadata(user);
    const count = dto.count || 5;

    const platformToneMap: Record<string, string> = {
      instagram: 'visual, emotional, curiosity-driven. Story-worthy.',
      linkedin:
        'professional, thought-provoking, insightful. Business-oriented.',
      tiktok: 'trendy, bold, pattern-interrupt style. Scroll-stopping.',
      twitter: 'punchy, concise, attention-grabbing. Max 280 chars per hook.',
    };

    const platformGuidance =
      platformToneMap[dto.platform] || platformToneMap.twitter;
    const toneInstruction = dto.tone ? `Tone: ${dto.tone}.` : '';

    const systemPrompt = `You are an expert social media copywriter specializing in hooks that stop the scroll. Generate hook variations that are optimized for maximum engagement. Return ONLY a JSON array of strings, no other text.`;

    const userPrompt = `Generate ${count} different hook variations for this topic: "${dto.topic}"

Platform: ${dto.platform} (${platformGuidance})
${toneInstruction}

Requirements:
- Each hook must be unique in approach (question, statistic, bold claim, story, contrarian take)
- Optimized for ${dto.platform} engagement patterns
- No hashtags in hooks
- Return as JSON array: ["hook1", "hook2", ...]`;

    try {
      const result = await this.replicateService.generateTextCompletionSync(
        DEFAULT_MINI_TEXT_MODEL,
        // @ts-expect-error TS2345
        `${systemPrompt}\n\n${userPrompt}`,
      );

      let hooks: string[] = [];
      try {
        // Try to parse JSON from the response
        const jsonMatch = result.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          hooks = JSON.parse(jsonMatch[0]);
        }
      } catch {
        // Fallback: split by newlines and clean up
        hooks = result
          .split('\n')
          .map((line: string) =>
            line
              .replace(/^\d+[.)]\s*/, '')
              .replace(/^["']|["']$/g, '')
              .trim(),
          )
          .filter((line: string) => line.length > 10)
          .slice(0, count);
      }

      return {
        hooks: hooks.slice(0, count),
        metadata: {
          count: hooks.length,
          generatedAt: new Date().toISOString(),
          platform: dto.platform,
          topic: dto.topic,
        },
      };
    } catch (error: unknown) {
      const errorMessage = (error as Error)?.message || 'Unknown error';
      this.logger.error(`Hook generation failed: ${errorMessage}`);
      throw new HttpException(
        {
          detail: errorMessage || 'Failed to generate hook variations',
          title: 'Hook generation failed',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
