/**
 * PostsController - CRUD operations for posts
 * Handles: POST /, GET /, GET /:postId, PATCH /:postId, DELETE /:postId
 *
 * All other operations (generate, batch, thread, reply, enhance)
 * are in PostsOperationsController
 */
import { ActivityEntity } from '@api/collections/activities/entities/activity.entity';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { CreatePostDto } from '@api/collections/posts/dto/create-post.dto';
import { PostsQueryDto } from '@api/collections/posts/dto/posts-query.dto';
import { UpdatePostDto } from '@api/collections/posts/dto/update-post.dto';
import {
  type PostDocument,
  Post as PostModel,
} from '@api/collections/posts/schemas/post.schema';
import {
  POST_ANALYTICS_PLATFORM_GROUP_PIPELINE,
  PostAnalyticsService,
} from '@api/collections/posts/services/post-analytics.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  returnBadRequest,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { QuotaService } from '@api/services/quota/quota.service';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import type { User } from '@clerk/backend';
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
import { PostSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('posts')
@UseGuards(RolesGuard)
export class PostsController extends BaseCRUDController<
  PostDocument,
  CreatePostDto,
  UpdatePostDto,
  PostsQueryDto
> {
  constructor(
    private readonly activitiesService: ActivitiesService,
    private readonly credentialsService: CredentialsService,
    private readonly ingredientsService: IngredientsService,
    private readonly quotaService: QuotaService,
    private readonly postAnalyticsService: PostAnalyticsService,
    public readonly postsService: PostsService,
    public readonly loggerService: LoggerService,
  ) {
    super(loggerService, postsService, PostSerializer, 'Post', [
      'ingredients',
      'credential',
    ]);
  }

  /**
   * Extract a label from text (first ~50 characters, truncated at word boundary)
   */
  private extractLabelFromText(text: string, maxLength: number = 50): string {
    if (!text || text.trim().length === 0) {
      return '';
    }

    const trimmed = text.trim();

    if (trimmed.length <= maxLength) {
      return trimmed;
    }

    // Truncate at word boundary
    const truncated = trimmed.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');

    if (lastSpace > maxLength * 0.7) {
      // If we found a space reasonably close to maxLength, use it
      return `${truncated.substring(0, lastSpace)}...`;
    }

    // Otherwise truncate at maxLength
    return `${truncated}...`;
  }

  @Post()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() createPostDto: CreatePostDto,
  ): Promise<JsonApiSingleResponse> {
    const publicMetadata = getPublicMetadata(user);

    try {
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

      // Validate TEXT category only allowed for Twitter when scheduling
      if (
        createPostDto.status === PostStatus.SCHEDULED &&
        createPostDto.category === PostCategory.TEXT &&
        credential.platform !== CredentialPlatform.TWITTER
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
        credential.platform !== CredentialPlatform.TWITTER
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
      let ingredientIds: string[] = [];

      if (createPostDto.ingredients && createPostDto.ingredients.length > 0) {
        // Batch fetch all ingredients in one query (avoids N+1 problem)
        const ingredients = await this.ingredientsService.findByIds(
          createPostDto.ingredients,
          publicMetadata.organization,
        );

        // Verify all requested ingredients were found
        if (ingredients.length !== createPostDto.ingredients.length) {
          // Find which ingredient IDs are missing
          const foundIds = new Set(ingredients.map((i) => i._id.toString()));
          const missingId = createPostDto.ingredients.find(
            (id) => !foundIds.has(id.toString()),
          );

          throw new HttpException(
            {
              detail:
                'Ingredient not found or does not belong to your organization',
              title: `Ingredient ${missingId?.toString()} not found`,
            },
            HttpStatus.NOT_FOUND,
          );
        }

        // Preserve the original order of ingredients
        const ingredientMap = new Map(
          ingredients.map((i) => [i._id.toString(), i]),
        );
        ingredientIds = createPostDto.ingredients.map((id) => id);
        firstIngredient = ingredientMap.get(
          createPostDto.ingredients[0].toString(),
        );
      } else if (createPostDto.campaign) {
        const campaignIngredients =
          await this.ingredientsService.findApprovedImagesByCampaign(
            createPostDto.campaign,
            publicMetadata.organization,
            publicMetadata.brand,
          );

        if (campaignIngredients.length === 0) {
          throw new HttpException(
            {
              detail:
                'No approved campaign images were found for the selected brand',
              title: `Campaign ${createPostDto.campaign} not found`,
            },
            HttpStatus.NOT_FOUND,
          );
        }

        ingredientIds = campaignIngredients.map((ingredient) => ingredient._id);
        [firstIngredient] = campaignIngredients;
      }

      await this.quotaService.verifyQuota(
        credential,
        publicMetadata.organization,
      );

      const data = await this.postsService.create({
        ...createPostDto,
        brand: firstIngredient ? firstIngredient.brand : publicMetadata.brand,
        category:
          createPostDto.category ||
          (firstIngredient
            ? firstIngredient.category === IngredientCategory.IMAGE
              ? PostCategory.IMAGE
              : firstIngredient.category === IngredientCategory.VIDEO
                ? PostCategory.VIDEO
                : PostCategory.TEXT
            : PostCategory.TEXT),
        credential: createPostDto.credential,
        description: createPostDto.description || credential.description || '',
        ingredients: ingredientIds,
        label:
          createPostDto.label?.trim() ||
          credential.label ||
          (createPostDto.description?.trim()
            ? this.extractLabelFromText(createPostDto.description.trim())
            : ''),
        organization: firstIngredient
          ? firstIngredient.organization
          : publicMetadata.organization,
        platform: credential.platform, // Save platform from credential
        publicationDate: createPostDto.publicationDate,
        scheduledDate: createPostDto.scheduledDate,
        status: createPostDto.status,
        tags: createPostDto.tags || [],
        user: publicMetadata.user,
      });

      await this.activitiesService.create(
        new ActivityEntity({
          brand: firstIngredient ? firstIngredient.brand : publicMetadata.brand,
          entityId: data._id,
          entityModel: ActivityEntityModel.POST,
          key: ActivityKey.VIDEO_SCHEDULED,
          organization: firstIngredient
            ? firstIngredient.organization
            : publicMetadata.organization,
          source: ActivitySource.SCRIPT,
          user: publicMetadata.user,
          value: (data._id as string).toString(),
        }),
      );

      if (credential.platform === CredentialPlatform.YOUTUBE) {
        this.postsService.handleYoutubePost(data).catch((error) => {
          this.loggerService.error(
            `Failed to trigger YouTube upload for post ${data._id}: ${error.message}`,
            error.stack,
          );
        });
      }

      return serializeSingle(request, this.serializer, data);
    } catch (error: unknown) {
      if (error instanceof Error && 'response' in error) {
        return returnBadRequest((error as { response: unknown }).response);
      }
      throw error;
    }
  }

  /**
   * Override buildFindAllPipeline for custom Posts aggregation
   * Includes ingredients array with metadata and credential lookups
   */
  public buildFindAllPipeline(
    user: User,
    query: PostsQueryDto,
  ): Record<string, unknown>[] {
    const publicMetadata = getPublicMetadata(user);
    const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);

    const adminFilter = CollectionFilterUtil.buildAdminFilter(
      publicMetadata,
      query,
    );

    const dateFilter: Record<string, unknown> = {};
    if (query.startDate || query.endDate) {
      dateFilter.scheduledDate = {};

      if (query.startDate) {
        // @ts-expect-error TS2571
        (dateFilter as Record<string, unknown>).scheduledDate.$gte = new Date(
          query.startDate,
        );
      }

      if (query.endDate) {
        // @ts-expect-error TS2571
        (dateFilter as Record<string, unknown>).scheduledDate.$lte = new Date(
          query.endDate,
        );
      }
    }

    const matchFilter: Record<string, unknown> = {
      ...(adminFilter ??
        CollectionFilterUtil.buildOwnershipFilter(publicMetadata)),
      isDeleted,
      ...dateFilter,
      // Only show parent posts (not children/replies)
      // Handle both null and undefined (undefined fields aren't stored in MongoDB)
      $or: [{ parent: null }, { parent: { $exists: false } }],
    };

    if (query.platform) {
      matchFilter.platform = query.platform;
    }

    if (query.status) {
      matchFilter.status = query.status;
    }

    if (query.credential) {
      matchFilter.credential = query.credential;
    }

    return [
      {
        $match: matchFilter,
      },
      // lookup ingredients array with metadata
      {
        $lookup: {
          as: 'ingredients',
          foreignField: '_id',
          from: 'ingredients',
          localField: 'ingredients',
          pipeline: [
            {
              $lookup: {
                as: 'metadata',
                foreignField: '_id',
                from: 'metadata',
                localField: 'metadata',
              },
            },
            {
              $unwind: {
                path: '$metadata',
                preserveNullAndEmptyArrays: true,
              },
            },
          ],
        },
      },
      {
        $lookup: {
          as: 'credential',
          foreignField: '_id',
          from: 'credentials',
          localField: 'credential',
        },
      },
      {
        $unwind: {
          path: '$credential',
          preserveNullAndEmptyArrays: true,
        },
      },
      // Lookup post-analytics to get KPIs (views, likes, comments, etc.)
      {
        $lookup: {
          as: 'analyticsData',
          foreignField: 'post',
          from: 'post-analytics',
          localField: '_id',
          // @ts-expect-error TS2322
          pipeline: [
            ...(POST_ANALYTICS_PLATFORM_GROUP_PIPELINE as unknown[]),
            {
              $group: {
                _id: null,
                avgEngagementRate: { $avg: '$avgEngagementRate' },
                totalComments: { $sum: '$totalComments' },
                totalLikes: { $sum: '$totalLikes' },
                totalSaves: { $sum: '$totalSaves' },
                totalShares: { $sum: '$totalShares' },
                totalViews: { $sum: '$totalViews' },
              },
            },
          ] as Record<string, unknown>[],
        },
      },
      // Flatten analytics data to top level
      {
        $addFields: {
          avgEngagementRate: {
            $ifNull: [
              { $arrayElemAt: ['$analyticsData.avgEngagementRate', 0] },
              0,
            ],
          },
          totalComments: {
            $ifNull: [{ $arrayElemAt: ['$analyticsData.totalComments', 0] }, 0],
          },
          totalLikes: {
            $ifNull: [{ $arrayElemAt: ['$analyticsData.totalLikes', 0] }, 0],
          },
          totalSaves: {
            $ifNull: [{ $arrayElemAt: ['$analyticsData.totalSaves', 0] }, 0],
          },
          totalShares: {
            $ifNull: [{ $arrayElemAt: ['$analyticsData.totalShares', 0] }, 0],
          },
          totalViews: {
            $ifNull: [{ $arrayElemAt: ['$analyticsData.totalViews', 0] }, 0],
          },
        },
      },
      // Remove the temporary analyticsData array
      {
        $project: {
          analyticsData: 0,
        },
      },
      // Lookup latest COMPLETED evaluation for each post
      {
        $lookup: {
          as: 'evaluationData',
          from: 'evaluations',
          let: { postId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$content', '$$postId'] },
                contentType: 'post',
                isDeleted: false,
                status: 'COMPLETED',
              },
            },
            { $sort: { updatedAt: -1 } },
            { $limit: 1 },
            { $project: { overallScore: 1 } },
          ],
        },
      },
      // Flatten evaluation score to top level
      {
        $addFields: {
          evalScore: {
            $ifNull: [
              { $arrayElemAt: ['$evaluationData.overallScore', 0] },
              null,
            ],
          },
        },
      },
      // Remove the temporary evaluationData array
      {
        $project: {
          evaluationData: 0,
        },
      },
      {
        $sort: handleQuerySort(query.sort),
      },
    ];
  }

  @Get()
  @RolesDecorator('superadmin')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  findAll(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: PostsQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    return super.findAll(request, user, query);
  }

  @Get(':postId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findOne(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('postId') postId: string,
  ): Promise<JsonApiSingleResponse> {
    const publicMetadata = getPublicMetadata(user);

    // Build aggregation pipeline to fetch post with ingredients, credential, and evaluation
    const pipeline: Record<string, unknown>[] = [
      {
        $match: {
          _id: postId,
          isDeleted: false,
        },
      },
      // Lookup ingredients array with metadata
      {
        $lookup: {
          as: 'ingredients',
          foreignField: '_id',
          from: 'ingredients',
          localField: 'ingredients',
          pipeline: [
            {
              $lookup: {
                as: 'metadata',
                foreignField: '_id',
                from: 'metadata',
                localField: 'metadata',
              },
            },
            {
              $unwind: {
                path: '$metadata',
                preserveNullAndEmptyArrays: true,
              },
            },
          ],
        },
      },
      // Lookup credential
      {
        $lookup: {
          as: 'credential',
          foreignField: '_id',
          from: 'credentials',
          localField: 'credential',
        },
      },
      {
        $unwind: {
          path: '$credential',
          preserveNullAndEmptyArrays: true,
        },
      },
      // Lookup latest COMPLETED evaluation for this post (full document)
      {
        $lookup: {
          as: 'evaluation',
          from: 'evaluations',
          let: { postId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$content', '$$postId'] },
                contentType: 'post',
                isDeleted: false,
                status: 'COMPLETED',
              },
            },
            { $sort: { updatedAt: -1 } },
            { $limit: 1 },
            // NO $project - include full evaluation document
          ],
        },
      },
      // Flatten evaluation to single object (or null)
      {
        $addFields: {
          evaluation: {
            $ifNull: [{ $arrayElemAt: ['$evaluation', 0] }, null],
          },
        },
      },
    ];

    // Execute aggregation using service method
    const result = await this.postsService.findAll(pipeline, {
      pagination: false,
    });

    if (!result.docs || result.docs.length === 0) {
      throw new HttpException(
        {
          detail: 'Post not found',
          title: `Post ${postId} not found`,
        },
        HttpStatus.NOT_FOUND,
      );
    }

    const post = result.docs[0];

    // Check organization access
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

    // Fetch all children of this post, sorted by order
    const children = await this.postsService.getChildren(postId, [
      PopulatePatterns.ingredientsMinimal,
      PopulatePatterns.credentialMinimal,
      PopulatePatterns.userMinimal,
      PopulatePatterns.brandMinimal,
    ]);

    // Fetch analytics summary for this post (non-blocking, returns null on error)
    let analytics = null;
    try {
      analytics =
        await this.postAnalyticsService.getPostAnalyticsSummary(postId);
    } catch (error: unknown) {
      this.loggerService.warn(
        `Failed to fetch analytics for post ${postId}: ${(error as Error)?.message}`,
      );
    }

    // Attach children and analytics to the post object
    // Also flatten analytics fields for convenience (Ingredient metadata pattern)
    const postWithChildren = {
      ...post,
      analytics,
      children,
      // Flatten analytics for easier frontend access
      ...(analytics
        ? {
            avgEngagementRate: analytics.avgEngagementRate,
            totalComments: analytics.totalComments,
            totalLikes: analytics.totalLikes,
            totalSaves: analytics.totalSaves,
            totalShares: analytics.totalShares,
            totalViews: analytics.totalViews,
          }
        : {}),
    };

    return serializeSingle(request, this.serializer, postWithChildren);
  }
}
