import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { EnhancePostDto } from '@api/collections/posts/dto/enhance-post.dto';
import { ExpandToThreadDto } from '@api/collections/posts/dto/expand-thread.dto';
import { GenerateAccountPostDto } from '@api/collections/posts/dto/generate-account-post.dto';
import { GenerateHooksDto } from '@api/collections/posts/dto/generate-hooks.dto';
import type { PostDocument } from '@api/collections/posts/schemas/post.schema';
import { PostGenerationService } from '@api/collections/posts/services/post-generation.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
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
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { ScoreSeoDto } from '@api/services/seo/dto/score-seo.dto';
import { SeoScorerService } from '@api/services/seo/seo-scorer.service';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import {
  ActivitySource,
  CredentialPlatform,
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
export class PostsGenerationController {
  private readonly serializer = PostSerializer;

  constructor(
    private readonly logger: LoggerService,
    private readonly postGenerationService: PostGenerationService,
    private readonly postsService: PostsService,
    private readonly seoScorerService: SeoScorerService,
  ) {}

  private normalizeCredentialPlatform(
    value: unknown,
  ): CredentialPlatform | undefined {
    const normalized = String(value ?? '').toLowerCase();
    return Object.values(CredentialPlatform).find(
      (platform) => platform === normalized,
    );
  }

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

    if (originalPost.organizationId !== publicMetadata.organization) {
      throw new HttpException(
        {
          detail: 'You do not have access to this post',
          title: 'Access denied',
        },
        HttpStatus.FORBIDDEN,
      );
    }

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

    if (
      this.normalizeCredentialPlatform(originalPost.platform) !==
      CredentialPlatform.TWITTER
    ) {
      throw new HttpException(
        {
          detail: 'Thread expansion is only available for Twitter/X posts',
          title: 'Platform not supported',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const createdPosts: PostDocument[] = [originalPost];
    const additionalCount = dto.count - 1;

    for (let i = 0; i < additionalCount; i++) {
      const childPost = await this.postsService.create({
        brand: publicMetadata.brand,
        category: PostCategory.TEXT,
        credential: originalPost.credentialId,
        description: 'Generating...',
        ingredients: [],
        label: '',
        order: i + 1,
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

    const response = serializeCollection(request, PostListSerializer, {
      docs: createdPosts,
    });

    this.postGenerationService
      .expandThreadAsync(
        originalPost,
        createdPosts.slice(1),
        dto,
        publicMetadata,
      )
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

    if (post.organizationId !== publicMetadata.organization) {
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

    if (post.organizationId !== publicMetadata.organization) {
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
