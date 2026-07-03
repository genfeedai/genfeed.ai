import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
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
import { GenerateAccountPostDto } from '@api/collections/posts/dto/generate-account-post.dto';
import { GenerateHooksDto } from '@api/collections/posts/dto/generate-hooks.dto';
import { GenerateThreadDto } from '@api/collections/posts/dto/generate-thread.dto';
import { GenerateTweetsDto } from '@api/collections/posts/dto/generate-tweets.dto';
import { type PostDocument } from '@api/collections/posts/schemas/post.schema';
import { PostGenerationService } from '@api/collections/posts/services/post-generation.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { ConfigService } from '@api/config/config.service';
import { DEFAULT_MINI_TEXT_MODEL } from '@api/constants/default-mini-text-model.constant';
import { Credits } from '@api/helpers/decorators/credits/credits.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import {
  returnBadRequest,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { QuotaService } from '@api/services/quota/quota.service';
import { ScoreSeoDto } from '@api/services/seo/dto/score-seo.dto';
import { SeoScorerService } from '@api/services/seo/seo-scorer.service';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
  CredentialPlatform,
  IngredientCategory,
  PostCategory,
  PostStatus,
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
    private readonly postGenerationService: PostGenerationService,
    private readonly postsService: PostsService,
    private readonly quotaService: QuotaService,
    private readonly seoScorerService: SeoScorerService,
  ) {}

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private getRefId(
    ref: string | IngredientRefDocument | null | undefined,
  ): string | undefined {
    if (typeof ref === 'string') {
      return ref;
    }

    return ref?.id?.toString() ?? ref?.id?.toString();
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
    const normalized = String(value ?? '').toLowerCase();
    return Object.values(CredentialPlatform).find(
      (platform) => platform === normalized,
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

  // ============================================================================
  // ENDPOINTS
  // ============================================================================

  @Post('account-generations')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async generateAccountContent(
    @Req() request: Request,
    @Body() dto: GenerateAccountPostDto,
    @CurrentUser() user: User,
  ): Promise<JsonApiCollectionResponse> {
    const publicMetadata = getPublicMetadata(user);

    if (dto.format === 'thread' && dto.count < 2) {
      throw new HttpException(
        {
          detail: 'Thread generation requires at least two posts',
          title: 'Invalid thread count',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (dto.format === 'thread' && dto.count > 25) {
      throw new HttpException(
        {
          detail: 'Thread generation supports at most 25 posts',
          title: 'Invalid thread count',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const createdPosts =
        await this.postGenerationService.startAccountContentGeneration(
          dto,
          publicMetadata,
        );

      return serializeCollection(request, PostListSerializer, {
        docs: createdPosts,
      });
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error('Failed to generate account content', error);
      throw new HttpException(
        {
          detail:
            (error as Error)?.message ||
            'An error occurred while generating account content',
          title: 'Failed to generate account content',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('generations')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async generateTweets(
    @Req() request: Request,
    @Body() dto: GenerateTweetsDto,
    @CurrentUser() user: User,
  ) {
    return this.generateAccountContent(
      request,
      { ...dto, format: 'post' },
      user,
    );
  }

  @Post('thread-generations')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async generateThread(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() dto: GenerateThreadDto,
  ): Promise<JsonApiCollectionResponse> {
    return this.generateAccountContent(
      request,
      { ...dto, format: 'thread' },
      user,
    );
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
        platform:
          this.normalizeCredentialPlatform(originalPost.platform) ??
          CredentialPlatform.TWITTER,
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
    this.postGenerationService
      .expandThreadAsync(
        originalPost,
        createdPosts.slice(1), // Only the new children
        dto,
        publicMetadata,
      )
      .catch((error) => {
        this.logger.error('Failed to expand thread asynchronously', error);
      });

    return response;
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
      const postMap = new Map(posts.map((p) => [p.id.toString(), p]));
      const ingredientSet = new Set(ingredients.map((i) => i.id.toString()));

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
            entityId: updatedPost.id,
            entityModel: ActivityEntityModel.POST,
            key: ActivityKey.VIDEO_SCHEDULED,
            organization: publicMetadata.organization,
            source: ActivitySource.SCRIPT,
            user: publicMetadata.user,
            value: (updatedPost.id as string).toString(),
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

      const textOnlyPlatforms = new Set([
        CredentialPlatform.THREADS,
        CredentialPlatform.TWITTER,
      ]);
      const isTextOnlyPlatform = textOnlyPlatforms.has(credentialPlatform);

      // Validate TEXT category only allowed for text-capable platforms when scheduling
      if (
        createPostDto.status === PostStatus.SCHEDULED &&
        createPostDto.category === PostCategory.TEXT &&
        !isTextOnlyPlatform
      ) {
        throw new HttpException(
          {
            detail: `${credential.platform} requires media when scheduling. Please add at least one image or video.`,
            title: 'Text-only posts not supported',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      // Validate ingredients required when scheduling for media-required platforms
      if (
        createPostDto.status === PostStatus.SCHEDULED &&
        !isTextOnlyPlatform
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
            ? this.postGenerationService.extractLabelFromTweet(
                createPostDto.description.trim(),
              )
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
          entityId: remixPost.id,
          entityModel: ActivityEntityModel.POST,
          key: ActivityKey.POST_CREATED,
          organization: publicMetadata.organization,
          source: ActivitySource.WEB,
          user: publicMetadata.user,
          value: (remixPost.id as string).toString(),
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

    try {
      const enhancedDescription =
        await this.postGenerationService.enhanceDescription(
          post,
          dto,
          publicMetadata,
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

  @Post(':postId/seo-scores')
  @Credits({
    description: 'SEO scoring (text model)',
    modelKey: DEFAULT_MINI_TEXT_MODEL,
    source: ActivitySource.POST_ENHANCEMENT,
  })
  @UseGuards(SubscriptionGuard, CreditsGuard)
  @UseInterceptors(CreditsInterceptor)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async scoreSeo(
    @Req() request: Request,
    @Param('postId') postId: string,
    @Body() dto: ScoreSeoDto,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    const publicMetadata = getPublicMetadata(user);

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

    await this.seoScorerService.scorePost(
      postId,
      publicMetadata.organization,
      dto.targetKeyword,
    );

    const updatedPost = await this.postsService.findOne({ _id: postId }, [
      PopulatePatterns.ingredientsMinimal,
      PopulatePatterns.credentialMinimal,
      PopulatePatterns.userMinimal,
      PopulatePatterns.brandMinimal,
    ]);

    return serializeSingle(request, this.serializer, updatedPost ?? post);
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
    const publicMetadata = getPublicMetadata(user);

    try {
      return await this.postGenerationService.generateHookVariations(
        dto,
        publicMetadata,
      );
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
