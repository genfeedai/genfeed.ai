import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ActivityEntity } from '@api/collections/activities/entities/activity.entity';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import type { IngredientRefDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { CreatePostDto } from '@api/collections/posts/dto/create-post.dto';
import { CreateRemixPostDto } from '@api/collections/posts/dto/create-remix-post.dto';
import { PostsBatchDto } from '@api/collections/posts/dto/posts-batch.dto';
import { PostGenerationService } from '@api/collections/posts/services/post-generation.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import {
  API_KEY_POST_CREATION_SCOPES,
  assertApiKeyPostStatusPublishingScope,
  assertApiKeyPublishingScope,
} from '@api/helpers/utils/auth/api-key-publishing-scope.util';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import {
  returnBadRequest,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { QuotaService } from '@api/services/quota/quota.service';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
  ApiKeyScope,
  CredentialPlatform,
  IngredientCategory,
  PostCategory,
  PostStatus,
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

  @Patch('batch')
  @RequiredScopes(ApiKeyScope.POSTS_SCHEDULE)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async batchUpdate(
    @Req() request: Request,
    @Body() dto: PostsBatchDto,
    @CurrentUser() user: User,
  ) {
    const publicMetadata = getPublicMetadata(user);
    assertApiKeyPublishingScope(publicMetadata, 'schedule');

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

      // Ingredient ids are still validated up front — the batch write only
      // attaches ingredients the caller's organization actually owns.
      const ingredientIds = dto.items
        .filter((t) => t.ingredientId)
        .map((t) => t.ingredientId as string);

      const ingredients =
        ingredientIds.length > 0
          ? await this.ingredientsService.findByIds(
              ingredientIds,
              publicMetadata.organization,
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
          publicMetadata.organization.toString(),
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
              brand: publicMetadata.brand,
              entityId: updatedPost.id,
              entityModel: ActivityEntityModel.POST,
              key: ActivityKey.VIDEO_SCHEDULED,
              organization: publicMetadata.organization,
              source: ActivitySource.SCRIPT,
              user: publicMetadata.user,
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
    const publicMetadata = getPublicMetadata(user);
    assertApiKeyPostStatusPublishingScope(publicMetadata, createPostDto.status);
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

      if (parentPost.organizationId !== publicMetadata.organization) {
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

      if (originalPost.organizationId !== publicMetadata.organization) {
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
}
