import { CreateRemixPostDto } from '@api/collections/posts/dto/create-remix-post.dto';
import { PostsBatchDto } from '@api/collections/posts/dto/posts-batch.dto';
import { PostGenerationService } from '@api/collections/posts/services/post-generation.service';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import {
  returnBadRequest,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { resolveDefaultTargetExecutionState } from '@api-types/contracts/scheduler.contract';
import {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
  ApiKeyScope,
  CredentialPlatform,
  IngredientCategory,
  PostCategory,
  parsePlatform,
  TargetExecutionState,
} from '@genfeedai/enums';
import type { JsonApiSingleResponse } from '@genfeedai/interfaces';
import { PostListSerializer, PostSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser as User } from '@server/auth/interfaces/authenticated-user.interface';
import { ActivityEntity } from '@server/collections/activities/entities/activity.entity';
import { ActivitiesService } from '@server/collections/activities/services/activities.service';
import { CredentialsService } from '@server/collections/credentials/services/credentials.service';
import { IngredientsService } from '@server/collections/ingredients/services/ingredients.service';
import { CreatePostDto } from '@server/collections/posts/dto/create-post.dto';
import { PostsService } from '@server/collections/posts/services/posts.service';
import { LogMethod } from '@server/helpers/decorators/log/log-method.decorator';
import {
  API_KEY_POST_CREATION_SCOPES,
  assertApiKeyPostStatusPublishingScope,
  assertApiKeyPublishingScope,
} from '@server/helpers/utils/auth/api-key-publishing-scope.util';
import { QuotaService } from '@server/services/quota/quota.service';
import { PopulatePatterns } from '@server/shared/utils/populate/populate.util';
import type { Request } from 'express';

@AutoSwagger()
@Controller('posts')
@UseGuards(RolesGuard)
export class PostsOperationsController {
  private readonly serializer = PostSerializer;
  constructor(
    private readonly activitiesService: ActivitiesService,
    private readonly credentialsService: CredentialsService,
    private readonly ingredientsService: IngredientsService,
    private readonly logger: LoggerService,
    private readonly postGenerationService: PostGenerationService,
    private readonly postsService: PostsService,
    private readonly quotaService: QuotaService,
  ) {}

  private getBadRequestResponse(
    response: unknown,
  ): string | Record<string, unknown> {
    return typeof response === 'string'
      ? response
      : typeof response === 'object' && response !== null
        ? (response as Record<string, unknown>)
        : { detail: 'Bad request' };
  }

  private normalizeIngredientCategory(
    value: unknown,
  ): IngredientCategory | undefined {
    return Object.values(IngredientCategory).find(
      (category) => category === value,
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

  private validateScheduledThreadReply(
    dto: CreatePostDto,
    platform: CredentialPlatform,
    platformLabel: string,
    executionState: TargetExecutionState,
  ): void {
    if (executionState !== TargetExecutionState.SCHEDULED) {
      return;
    }

    const supportsTextOnly = new Set([
      CredentialPlatform.THREADS,
      CredentialPlatform.TWITTER,
    ]).has(platform);
    if (dto.category === PostCategory.TEXT && !supportsTextOnly) {
      throw new HttpException(
        {
          detail: `${platformLabel} requires media when scheduling. Please add at least one image or video.`,
          title: 'Text-only posts not supported',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (
      !supportsTextOnly &&
      (!dto.ingredients || dto.ingredients.length === 0)
    ) {
      throw new HttpException(
        {
          detail: `${platformLabel} requires at least one image or video when scheduling.`,
          title: 'Media required when scheduling',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private async resolveThreadReplyIngredients(
    ingredientIds: string[] | undefined,
    organizationId: string,
  ): Promise<{
    firstIngredient: Awaited<ReturnType<IngredientsService['findOne']>>;
    ingredientIds: string[];
  }> {
    let firstIngredient: Awaited<ReturnType<IngredientsService['findOne']>> =
      null;
    const resolvedIds: string[] = [];

    for (const ingredientId of ingredientIds ?? []) {
      const ingredient = await this.ingredientsService.findOne({
        id: ingredientId,
        organizationId,
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

      resolvedIds.push(ingredientId);
      firstIngredient ??= ingredient;
    }
    return { firstIngredient, ingredientIds: resolvedIds };
  }

  @Patch('batch')
  @RequiredScopes(ApiKeyScope.POSTS_SCHEDULE)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async batchUpdate(
    @Req() request: Request,
    @Body() dto: PostsBatchDto,
    @CurrentUser() user: User,
  ) {
    assertApiKeyPublishingScope(user, 'schedule');

    try {
      // Validate credential
      const credential = await this.credentialsService.findOne({
        id: dto.credentialId,
        isConnected: true,
        organizationId: user.organizationId,
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

      // Ingredient ids are still validated up front — the batch write only
      // attaches ingredients the caller's organization actually owns.
      const ingredientIds = dto.items
        .filter((t) => t.ingredientId)
        .map((t) => t.ingredientId as string);

      const ingredients =
        ingredientIds.length > 0
          ? await this.ingredientsService.findByIds(
              ingredientIds,
              user.organizationId,
            )
          : [];
      const ingredientSet = new Set(ingredients.map((i) => i.id.toString()));

      // One scoped read + one transaction for the whole batch, replacing the
      // per-item `patch` loop (2–4 sequential round-trips each).
      const { missingPostIds, posts: updatedPosts } =
        await this.postsService.batchSchedule(
          dto.items.map((item) => ({
            ingredientIds:
              item.ingredientId && ingredientSet.has(item.ingredientId)
                ? [item.ingredientId]
                : [],
            postId: String(item.postId),
            scheduledDate: String(item.scheduledDate),
            text: item.text,
            timezone: item.timezone,
          })),
          user.organizationId.toString(),
          {
            credentialId: dto.credentialId,
            platform: String(credential.platform),
          },
          user.id,
        );

      if (missingPostIds.length > 0) {
        this.logger.warn('Skipped posts not found in organization', {
          count: missingPostIds.length,
          postIds: missingPostIds,
        });
      }

      // One insert for every activity instead of one per scheduled post.
      await this.activitiesService.createMany(
        updatedPosts.map(
          (updatedPost) =>
            new ActivityEntity({
              brandId: user.brandId,
              entityId: updatedPost.id,
              entityModel: ActivityEntityModel.POST,
              key: ActivityKey.VIDEO_SCHEDULED,
              organizationId: user.organizationId,
              source: ActivitySource.SCRIPT,
              userId: user.userId ?? user.id,
              value: (updatedPost.id as string).toString(),
            }),
        ),
      );

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
  @RequiredScopes(...API_KEY_POST_CREATION_SCOPES)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async addThreadReply(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('postId') postId: string,
    @Body() createPostDto: CreatePostDto,
  ): Promise<JsonApiSingleResponse> {
    const requestedExecutionState = resolveDefaultTargetExecutionState({
      scheduledDate: createPostDto.scheduledDate,
      targetExecutionState: createPostDto.targetExecutionState,
    });
    assertApiKeyPostStatusPublishingScope(user, requestedExecutionState);
    const parentId = postId;
    try {
      const parentPost = await this.postsService.findOne({ id: parentId });
      if (!parentPost) {
        throw new HttpException(
          {
            detail: 'Parent post not found',
            title: `Parent post ${parentId} not found`,
          },
          HttpStatus.NOT_FOUND,
        );
      }

      if (parentPost.organizationId !== user.organizationId) {
        throw new HttpException(
          {
            detail: 'You do not have access to this post',
            title: 'Access denied',
          },
          HttpStatus.FORBIDDEN,
        );
      }

      const credential = await this.credentialsService.findOne({
        id: createPostDto.credentialId,
        isConnected: true,
        organizationId: user.organizationId,
      });

      if (!credential) {
        throw new HttpException(
          {
            detail: 'Credential not found',
            title: `Credential ${createPostDto.credentialId.toString()} not found`,
          },
          HttpStatus.NOT_FOUND,
        );
      }

      const credentialPlatform = parsePlatform(credential.platform);
      if (!credentialPlatform) {
        throw new HttpException(
          {
            detail: 'Unsupported credential platform',
            title: 'Platform not supported',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      this.validateScheduledThreadReply(
        createPostDto,
        credentialPlatform,
        credential.platform,
        requestedExecutionState,
      );
      const { firstIngredient, ingredientIds } =
        await this.resolveThreadReplyIngredients(
          createPostDto.ingredients,
          user.organizationId,
        );

      await this.quotaService.verifyQuota(credential, user.organizationId);

      const data = await this.postsService.addThreadReply(parentId, {
        ...createPostDto,
        brandId: firstIngredient?.brandId ?? user.brandId,
        category:
          createPostDto.category ??
          this.getPostCategoryFromIngredient(firstIngredient),
        credentialId: createPostDto.credentialId,
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
        organizationId: firstIngredient?.organizationId ?? user.organizationId,
        platform: credentialPlatform,
        publicationDate: createPostDto.publicationDate,
        scheduledDate: createPostDto.scheduledDate,
        targetExecutionState: requestedExecutionState,
        tags: createPostDto.tags || [],
        userId: user.userId ?? user.id,
        visibility: createPostDto.visibility,
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
    try {
      // Verify the original post exists and user has access
      const originalPost = await this.postsService.findOne({ id: postId }, [
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

      if (originalPost.organizationId !== user.organizationId) {
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
          brandId: user.brandId,
          label: dto.label,
          organizationId: user.organizationId,
          userId: user.userId ?? user.id,
        },
      );

      // Create activity log
      await this.activitiesService.create(
        new ActivityEntity({
          brandId: user.brandId,
          entityId: remixPost.id,
          entityModel: ActivityEntityModel.POST,
          key: ActivityKey.POST_CREATED,
          organizationId: user.organizationId,
          source: ActivitySource.WEB,
          userId: user.userId ?? user.id,
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
}
