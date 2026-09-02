/**
 * PostsController - CRUD operations for posts
 * Handles: POST /, GET /, GET /:postId, PATCH /:postId, DELETE /:postId
 *
 * All other operations (generate, batch, thread, reply, enhance)
 * are in PostsOperationsController
 */

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { AccountHealthService } from '@api/collections/credentials/services/account-health.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { CreatePostDto } from '@api/collections/posts/dto/create-post.dto';
import { PostsQueryDto } from '@api/collections/posts/dto/posts-query.dto';
import { UpdatePostDto } from '@api/collections/posts/dto/update-post.dto';
import { createPost } from '@api/collections/posts/handlers/post-create.handler';
import type { PostDocument } from '@api/collections/posts/post.schema';
import { PostAnalyticsService } from '@api/collections/posts/services/post-analytics.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { assertApiKeyPublishingScope } from '@api/helpers/utils/auth/api-key-publishing-scope.util';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { customLabels } from '@api/helpers/utils/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  returnBadRequest,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { QuotaService } from '@api/services/quota/quota.service';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import { ApiKeyScope, TargetExecutionState } from '@genfeedai/contracts';
import {
  postExecutionStateReadFilter,
  postVisibilityReadFilter,
  resolveDefaultTargetExecutionState,
} from '@genfeedai/contracts/api-types/contracts/scheduler.contract';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/contracts/interfaces';
import { PostListSerializer, PostSerializer } from '@genfeedai/serializers';
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
    private readonly accountHealthService: AccountHealthService,
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

  @Post()
  @RequiredScopes(
    ApiKeyScope.POSTS_DRAFT,
    ApiKeyScope.POSTS_CREATE,
    ApiKeyScope.POSTS_SCHEDULE,
    ApiKeyScope.POSTS_PUBLISH,
  )
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() createPostDto: CreatePostDto,
  ): Promise<JsonApiSingleResponse> {
    const executionState = resolveDefaultTargetExecutionState({
      scheduledDate: createPostDto.scheduledDate,
      targetExecutionState: createPostDto.targetExecutionState,
    });
    assertApiKeyPublishingScope(
      user,
      executionState === TargetExecutionState.DRAFT
        ? 'draft'
        : executionState === TargetExecutionState.SCHEDULED
          ? 'schedule'
          : 'publish',
    );

    try {
      const data = await createPost({
        createPostDto,
        dependencies: {
          accountHealthService: this.accountHealthService,
          activitiesService: this.activitiesService,
          credentialsService: this.credentialsService,
          ingredientsService: this.ingredientsService,
          loggerService: this.loggerService,
          postsService: this.postsService,
          quotaService: this.quotaService,
        },
        identity: user,
      });

      return serializeSingle(request, this.serializer, data);
    } catch (error: unknown) {
      if (error instanceof Error && 'response' in error) {
        const response = (error as { response?: unknown }).response;
        return returnBadRequest(
          typeof response === 'string' ||
            (response !== null && typeof response === 'object')
            ? (response as string | Record<string, unknown>)
            : 'Bad request',
        );
      }
      throw error;
    }
  }

  protected override assertPatchAllowed(
    user: User,
    existing: PostDocument,
    updateDto: Partial<UpdatePostDto>,
  ): void {
    const existingStatus = Object.values(TargetExecutionState).includes(
      existing.targetExecutionState as TargetExecutionState,
    )
      ? (existing.targetExecutionState as TargetExecutionState)
      : TargetExecutionState.DRAFT;
    const nextStatus = updateDto.targetExecutionState ?? existingStatus;
    const changesPublishState =
      ![TargetExecutionState.DRAFT, TargetExecutionState.SCHEDULED].includes(
        existingStatus,
      ) ||
      ![TargetExecutionState.DRAFT, TargetExecutionState.SCHEDULED].includes(
        nextStatus,
      );
    const changesScheduleIntent =
      !changesPublishState &&
      (existingStatus === TargetExecutionState.SCHEDULED ||
        nextStatus === TargetExecutionState.SCHEDULED ||
        updateDto.scheduledDate !== undefined);
    assertApiKeyPublishingScope(
      user,
      changesPublishState
        ? 'publish'
        : changesScheduleIntent
          ? 'schedule'
          : 'draft',
    );
  }

  /**
   * Override buildFindAllQuery for custom Posts aggregation
   * Includes ingredients array with metadata and credential lookups
   */
  public buildFindAllQuery(user: User, query: PostsQueryDto) {
    const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);

    const adminFilter = CollectionFilterUtil.buildAdminFilter(user, query);

    const dateFilter: Record<string, unknown> = {};
    if (query.startDate || query.endDate) {
      dateFilter.scheduledDate = {};

      if (query.startDate) {
        // @ts-expect-error TS2571
        (dateFilter as Record<string, unknown>).scheduledDate.gte = new Date(
          query.startDate,
        );
      }

      if (query.endDate) {
        // @ts-expect-error TS2571
        (dateFilter as Record<string, unknown>).scheduledDate.lte = new Date(
          query.endDate,
        );
      }
    }

    const matchFilter: Record<string, unknown> = {
      ...(adminFilter ?? CollectionFilterUtil.buildOwnershipFilter(user)),
      isDeleted,
      ...dateFilter,
      // Only show parent posts (not children/replies)
      parentId: null,
    };

    // Members may narrow to a brand/org (preferred over nested relationship lists).
    // Superadmin already gets these via adminFilter when present.
    if (!adminFilter && (query.brandId || query.organizationId)) {
      const scope = CollectionFilterUtil.resolveAuthorizedTenantQuery(
        query,
        user,
        false,
      );
      if (scope.brandId) {
        matchFilter.brandId = scope.brandId;
      }
      if (scope.organizationId) {
        matchFilter.organizationId = scope.organizationId;
      }
    }

    if (query.platform) {
      matchFilter.platform = query.platform;
    }

    const executionState = query.executionState;
    const axisFilters: Record<string, unknown>[] = [];
    if (executionState) {
      axisFilters.push(postExecutionStateReadFilter(executionState));
    } else if (query.publicationState) {
      const publishedFilter = postExecutionStateReadFilter(
        TargetExecutionState.PUBLISHED,
      );
      axisFilters.push(
        query.publicationState === 'posted'
          ? publishedFilter
          : { NOT: publishedFilter },
      );
    }

    if (query.visibility) {
      axisFilters.push(postVisibilityReadFilter(query.visibility));
    }
    if (axisFilters.length > 0) {
      matchFilter.AND = axisFilters;
    }

    if (query.credentialId) {
      matchFilter.credentialId = query.credentialId;
    }

    if (query.campaignId) {
      matchFilter.campaignId = query.campaignId;
    }

    return { where: matchFilter, orderBy: handleQuerySort(query.sort) };
  }

  @Get()
  // No @RolesDecorator here: the posts list backs normal-user surfaces (e.g. the
  // brand calendar). `buildFindAllQuery` already scopes results to the caller via
  // `buildOwnershipFilter` (own/org posts) or, for superadmins passing explicit
  // org/brand params, `buildAdminFilter`. The class-level RolesGuard still
  // enforces org membership. The prior `@RolesDecorator('superadmin')` was a
  // carried-over migration artifact that 403'd every non-superadmin (#1223).
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAll(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: PostsQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };
    const aggregate = this.buildFindAllQuery(user, query);
    const data = await this.postsService.findAll(aggregate, options);
    return serializeCollection(request, PostListSerializer, data);
  }

  @Get(':postId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findOne(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('postId') postId: string,
  ): Promise<JsonApiSingleResponse> {
    // Build findAll query to fetch post with ingredients, credential, and evaluation
    const pipeline = {
      where: {
        id: postId,
        isDeleted: false,
      },
    };

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
    if (post.organizationId.toString() !== user.organizationId.toString()) {
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
