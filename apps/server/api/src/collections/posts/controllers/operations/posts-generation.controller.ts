import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import {
  createPostsGenerationHttpException,
  generationFailureMessage,
  invalidThreadCountMessage,
  isAccountThreadFormat,
  isOwnedPost,
  isTwitterPlatform,
  postAccessBlockReason,
} from '@api/collections/posts/controllers/operations/posts-generation.helpers';
import { EnhancePostDto } from '@api/collections/posts/dto/enhance-post.dto';
import { ExpandToThreadDto } from '@api/collections/posts/dto/expand-thread.dto';
import { GenerateAccountPostDto } from '@api/collections/posts/dto/generate-account-post.dto';
import { GenerateHooksDto } from '@api/collections/posts/dto/generate-hooks.dto';
import { GenerateSourcePostVariationsDto } from '@api/collections/posts/dto/generate-source-post-variations.dto';
import { RepurposePostDto } from '@api/collections/posts/dto/repurpose-post.dto';
import { PostVariationSourceGuard } from '@api/collections/posts/guards/post-variation-source.guard';
import type { PostDocument } from '@api/collections/posts/post.schema';
import { PostGenerationService } from '@api/collections/posts/services/post-generation.service';
import { PostRepurposeService } from '@api/collections/posts/services/post-repurpose.service';
import { PostVariationService } from '@api/collections/posts/services/post-variation.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import type { SourcePostVariationRequest } from '@api/collections/posts/services/source-post-variation.types';
import { DEFAULT_MINI_TEXT_MODEL } from '@api/constants/default-mini-text-model.constant';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import {
  Credits,
  DeferCreditsUntilModelResolution,
} from '@api/helpers/decorators/credits/credits.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import {
  finalizeDeferredTextCredits,
  finalizeOutputCredits,
} from '@api/helpers/utils/credits/finalize-deferred-credits.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { ScoreSeoDto } from '@api/services/seo/dto/score-seo.dto';
import { SeoScorerService } from '@api/services/seo/seo-scorer.service';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import { BATCH_CAPTION_BASE_CREDITS } from '@genfeedai/constants';
import {
  ActivitySource,
  CredentialPlatform,
  PostCategory,
  PostRepurposeMode,
  parsePlatform,
  TargetExecutionState,
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
export class PostsGenerationController {
  private readonly serializer = PostSerializer;

  constructor(
    private readonly logger: LoggerService,
    private readonly postGenerationService: PostGenerationService,
    private readonly postRepurposeService: PostRepurposeService,
    private readonly postVariationService: PostVariationService,
    private readonly postsService: PostsService,
    private readonly seoScorerService: SeoScorerService,
  ) {}

  /**
   * Generate a strict set of source-aware, brand-contextualized variations.
   * The source guard intentionally runs before CreditsGuard so missing or
   * foreign source records cannot reserve credits or reach an external model.
   */
  @Post('source-variations')
  @Credits({
    amount: BATCH_CAPTION_BASE_CREDITS,
    description: 'Source post variation',
    source: ActivitySource.POST_ENHANCEMENT,
  })
  @UseGuards(PostVariationSourceGuard, SubscriptionGuard, CreditsGuard)
  @UseInterceptors(CreditsInterceptor)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async generateSourceVariations(
    @Req() request: SourcePostVariationRequest,
    @CurrentUser() user: User,
    @Body() dto: GenerateSourcePostVariationsDto,
  ): Promise<JsonApiCollectionResponse> {
    const source = request.resolvedPostVariationSource;
    if (!source) {
      throw new NotFoundException('Source post');
    }

    const result = await this.postVariationService.generate({
      brandId: user.brandId,
      count: dto.count,
      organizationId: user.organizationId,
      platform: dto.platform,
      source,
      userId: user.userId ?? user.id,
    });
    finalizeOutputCredits(request, result.meta.creditCost);

    return {
      ...serializeCollection(request, PostListSerializer, {
        docs: result.posts,
      }),
      meta: { ...result.meta },
    };
  }

  /**
   * Repurpose an existing post into a draft for another channel (#2588).
   *
   * Deterministic mode adapts the caption through the channel capability
   * catalog with no LLM involved; agent mode rewrites it with the content
   * engine and lands the draft in the review queue. Credits are deferred and
   * only finalized for agent mode, so deterministic repurposing stays free.
   */
  @Post(':postId/repurpose')
  @Credits({
    description: 'Post repurpose (agent rewrite)',
    source: ActivitySource.POST_ENHANCEMENT,
  })
  @DeferCreditsUntilModelResolution()
  @UseGuards(SubscriptionGuard, CreditsGuard)
  @UseInterceptors(CreditsInterceptor)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async repurposePost(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('postId') postId: string,
    @Body() dto: RepurposePostDto,
  ): Promise<JsonApiSingleResponse> {
    const result = await this.postRepurposeService.repurpose({
      credentialId: dto.credentialId,
      mode: dto.mode,
      organizationId: user.organizationId,
      platform: dto.platform,
      postId,
      userId: user.userId ?? user.id,
    });

    if (dto.mode === PostRepurposeMode.AGENT) {
      finalizeDeferredTextCredits(request, BATCH_CAPTION_BASE_CREDITS);
    }

    return serializeSingle(request, this.serializer, {
      ...result.draft,
      repurposeAdjustments: result.adjustments,
    });
  }

  @Post('account-generations')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async generateAccountContent(
    @Req() request: Request,
    @Body() dto: GenerateAccountPostDto,
    @CurrentUser() user: User,
  ): Promise<JsonApiCollectionResponse> {
    if (isAccountThreadFormat(dto.format)) {
      const invalidCount = invalidThreadCountMessage(dto.count);
      if (invalidCount) {
        throw createPostsGenerationHttpException(
          invalidCount.detail,
          invalidCount.title,
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    try {
      const createdPosts =
        await this.postGenerationService.startAccountContentGeneration(
          dto,
          user,
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
          detail: generationFailureMessage(
            error,
            'An error occurred while generating account content',
          ),
          title: 'Failed to generate account content',
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
    const originalPost = await this.postsService.findOne({ id: postId }, [
      PopulatePatterns.ingredientsMinimal,
      PopulatePatterns.credentialMinimal,
    ]);

    if (!originalPost) {
      throw createPostsGenerationHttpException(
        'The specified post does not exist',
        'Post not found',
        HttpStatus.NOT_FOUND,
      );
    }

    if (!isOwnedPost(originalPost, user.organizationId)) {
      throw createPostsGenerationHttpException(
        'You do not have access to this post',
        'Access denied',
        HttpStatus.FORBIDDEN,
      );
    }

    const existingChildren = await this.postsService.count(
      originalPost.organizationId,
      {
        parentId: postId,
      },
    );

    if (existingChildren > 0) {
      throw createPostsGenerationHttpException(
        'This post already has thread children. Cannot expand further.',
        'Already a thread',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!isTwitterPlatform(originalPost.platform)) {
      throw createPostsGenerationHttpException(
        'Thread expansion is only available for Twitter/X posts',
        'Platform not supported',
        HttpStatus.BAD_REQUEST,
      );
    }

    const createdPosts: PostDocument[] = [originalPost];
    const additionalCount = dto.count - 1;

    for (let i = 0; i < additionalCount; i++) {
      const childPost = await this.postsService.create({
        brandId: user.brandId,
        category: PostCategory.TEXT,
        credentialId: originalPost.credentialId ?? undefined,
        description: 'Generating...',
        ingredients: [],
        label: '',
        order: i + 1,
        organizationId: user.organizationId,
        parentId: postId,
        platform:
          parsePlatform(originalPost.platform) ?? CredentialPlatform.TWITTER,
        targetExecutionState: TargetExecutionState.PUBLISHING,
        userId: user.userId ?? user.id,
      });
      createdPosts.push(childPost);
    }

    const response = serializeCollection(request, PostListSerializer, {
      docs: createdPosts,
    });

    this.postGenerationService
      .expandThreadAsync(originalPost, createdPosts.slice(1), dto, user)
      .catch((error) => {
        this.logger.error('Failed to expand thread asynchronously', error);
      });

    return response;
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
    const post = await this.postsService.findOne({ id: postId }, [
      PopulatePatterns.ingredientsMinimal,
      PopulatePatterns.credentialMinimal,
    ]);

    const enhanceAccess = postAccessBlockReason(
      post,
      user.organizationId,
      postId,
    );
    if (enhanceAccess) {
      throw createPostsGenerationHttpException(
        enhanceAccess.detail,
        enhanceAccess.title,
        enhanceAccess.status,
      );
    }
    if (!post) {
      throw new NotFoundException('Post', postId);
    }

    try {
      const enhancedDescription =
        await this.postGenerationService.enhanceDescription(post, dto, user);
      const updatedPost = await this.postsService.patch(postId, {
        description: enhancedDescription,
      });

      return serializeSingle(request, this.serializer, updatedPost);
    } catch (error: unknown) {
      const errorMessage = generationFailureMessage(error, 'Unknown error');
      const errorStack = error instanceof Error ? error.stack : undefined;

      this.logger.error(`Post enhancement failed: ${errorMessage}`, errorStack);
      throw createPostsGenerationHttpException(
        errorMessage || 'Failed to enhance post content',
        'Enhancement failed',
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
    const post = await this.postsService.findOne({ id: postId }, [
      PopulatePatterns.ingredientsMinimal,
      PopulatePatterns.credentialMinimal,
    ]);

    const seoAccess = postAccessBlockReason(post, user.organizationId, postId);
    if (seoAccess) {
      throw createPostsGenerationHttpException(
        seoAccess.detail,
        seoAccess.title,
        seoAccess.status,
      );
    }

    await this.seoScorerService.scorePost(
      postId,
      user.organizationId,
      dto.targetKeyword,
    );

    const updatedPost = await this.postsService.findOne({ id: postId }, [
      PopulatePatterns.ingredientsMinimal,
      PopulatePatterns.credentialMinimal,
      PopulatePatterns.userMinimal,
      PopulatePatterns.brandMinimal,
    ]);

    return serializeSingle(request, this.serializer, updatedPost ?? post);
  }

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
    try {
      return await this.postGenerationService.generateHookVariations(dto, user);
    } catch (error: unknown) {
      const errorMessage = generationFailureMessage(error, 'Unknown error');
      this.logger.error(`Hook generation failed: ${errorMessage}`);
      throw createPostsGenerationHttpException(
        errorMessage || 'Failed to generate hook variations',
        'Hook generation failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
