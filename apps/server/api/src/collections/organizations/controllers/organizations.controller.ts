import { type ActivityDocument } from '@api/collections/activities/schemas/activity.schema';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { BrandEntity } from '@api/collections/brands/entities/brand.entity';
import { type BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { IngredientsQueryDto } from '@api/collections/ingredients/dto/ingredients-query.dto';
import { type IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MemberEntity } from '@api/collections/members/entities/member.entity';
import { MembersService } from '@api/collections/members/services/members.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { CreateOrganizationDto } from '@api/collections/organizations/dto/create-organization.dto';
import { OrganizationQueryDto } from '@api/collections/organizations/dto/organization-query.dto';
import { UpdateOrganizationDto } from '@api/collections/organizations/dto/update-organization.dto';
import { OrganizationEntity } from '@api/collections/organizations/entities/organization.entity';
import {
  Organization,
  type OrganizationDocument,
} from '@api/collections/organizations/schemas/organization.schema';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { type PostDocument } from '@api/collections/posts/schemas/post.schema';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { RolesService } from '@api/collections/roles/services/roles.service';
import { type TagDocument } from '@api/collections/tags/schemas/tag.schema';
import { TagsService } from '@api/collections/tags/services/tags.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { VideosQueryDto } from '@api/collections/videos/dto/videos-query.dto';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import { RequestContextCacheService } from '@api/common/services/request-context-cache.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { BrandFilterUtil } from '@api/helpers/utils/brand-filter/brand-filter.util';
import {
  getIsSuperAdmin,
  getPublicMetadata,
} from '@api/helpers/utils/clerk/clerk.util';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { IngredientFilterUtil } from '@api/helpers/utils/ingredient-filter/ingredient-filter.util';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { ClerkService } from '@api/services/integrations/clerk/clerk.service';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import { generateLabel } from '@api/shared/utils/label/label.util';
import { PipelineBuilder } from '@api/shared/utils/pipeline-builder/pipeline-builder.util';
import { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import type { User } from '@clerk/backend';
import type {
  JsonApiCollectionResponse,
  SortObject,
} from '@genfeedai/interfaces';
import {
  ActivitySerializer,
  BrandSerializer,
  IngredientSerializer,
  OrganizationSerializer,
  PostSerializer,
  TagSerializer,
  VideoSerializer,
} from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

const OBJECT_ID_REGEX = /^[0-9a-f]{24}$/i;
function isValidObjectId(id: unknown): id is string {
  return typeof id === 'string' && OBJECT_ID_REGEX.test(id);
}
@AutoSwagger()
@ApiTags('organizations')
@ApiBearerAuth()
@Controller('organizations')
@UseGuards(RolesGuard)
export class OrganizationsController extends BaseCRUDController<
  OrganizationDocument,
  CreateOrganizationDto,
  UpdateOrganizationDto,
  OrganizationQueryDto
> {
  constructor(
    public readonly loggerService: LoggerService,
    private readonly brandsService: BrandsService,
    private readonly activitiesService: ActivitiesService,
    private readonly membersService: MembersService,
    private readonly organizationsService: OrganizationsService,
    private readonly postsService: PostsService,
    private readonly tagsService: TagsService,
    private readonly videosService: VideosService,
    private readonly ingredientsService: IngredientsService,
    private readonly usersService: UsersService,
    private readonly rolesService: RolesService,
    private readonly organizationSettingsService: OrganizationSettingsService,
    private readonly clerkService: ClerkService,
    private readonly requestContextCacheService: RequestContextCacheService,
    private readonly accessBootstrapCacheService: AccessBootstrapCacheService,
  ) {
    super(
      loggerService,
      organizationsService,
      OrganizationSerializer,
      Organization.name,
      ['settings'], // Populate settings virtual field
    );
  }

  /**
   * Verify user has access to organization (owner, member, or superadmin)
   * Throws HttpException if access is denied
   */
  private async verifyOrganizationAccess(
    organizationId: string,
    userId: string,
    isSuperAdmin: boolean,
  ): Promise<void> {
    const [member, isOwner] = await Promise.all([
      this.membersService.findOne({
        isActive: true,
        isDeleted: false,
        organization: organizationId,
        user: userId,
      }),
      this.organizationsService.findOne({
        _id: organizationId,
        user: userId,
      }),
    ]);

    if (!isOwner && !member && !isSuperAdmin) {
      throw new HttpException(
        {
          detail: 'Access denied to this organization',
          title: 'Forbidden',
        },
        HttpStatus.FORBIDDEN,
      );
    }
  }

  /**
   * GET /organizations/by-slug/:slug
   * Resolve an organization by its URL-friendly slug.
   */
  @Get('by-slug/:slug')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findBySlug(
    @Req() request: Request,
    @Param('slug') slug: string,
  ): Promise<unknown> {
    const org = await this.organizationsService.findBySlug(slug);
    if (!org) {
      throw new NotFoundException(`Organization with slug "${slug}" not found`);
    }
    return serializeSingle(request, OrganizationSerializer, org);
  }

  /**
   * PATCH /organizations/:id/slug
   * Update the slug for an organization.
   */
  @Patch(':id/slug')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async updateSlug(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() body: { slug: string },
  ): Promise<unknown> {
    const existing = await this.organizationsService.findBySlug(body.slug);
    if (existing && existing._id.toString() !== id) {
      throw new BadRequestException(`Slug "${body.slug}" is already taken`);
    }
    const org = await this.organizationsService.patch(id, {
      slug: body.slug,
    });
    return serializeSingle(request, OrganizationSerializer, org);
  }

  @Get()
  @RolesDecorator('superadmin')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAll(
    @Req() request: Request,
    @CurrentUser() _user: User,
    @Query() query: OrganizationQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);
    const aggregate: Record<string, unknown>[] = [
      {
        $match: {
          isDeleted,
        },
      },
      {
        $sort: handleQuerySort(query.sort),
      },
    ];

    const data: AggregatePaginateResult<OrganizationDocument> =
      await this.organizationsService.findAll(aggregate, options);
    return serializeCollection(request, OrganizationSerializer, data);
  }

  @Get(':organizationId/brands')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAllBrands(
    @Req() request: Request,
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: User,
    @Query() query: OrganizationQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);

    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const publicMetadata = getPublicMetadata(user);
    const aggregate: Record<string, unknown>[] = [
      {
        $match: {
          $or: [
            { user: publicMetadata.user },
            { organization: organizationId },
          ],
          isDeleted,
        },
      },
      // Lookup brand assets (logo, banner, references, credentials)
      ...BrandFilterUtil.buildBrandAssetLookups(),
      {
        $sort: handleQuerySort(query.sort),
      },
    ];

    const data: AggregatePaginateResult<BrandDocument> =
      await this.brandsService.findAll(aggregate, options);
    return serializeCollection(request, BrandSerializer, data);
  }

  @Get(':organizationId/ingredients')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAllIngredients(
    @Req() request: Request,
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: User,
    @Query() query: IngredientsQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const publicMetadata = getPublicMetadata(user);

    // Check if the user is a member of the organization
    const member = await this.membersService.findOne({
      isDeleted: false,
      organization: organizationId,
      user: publicMetadata.user,
    });

    if (!member) {
      throw new HttpException(
        'Forbidden: You are not a member of this organization',
        HttpStatus.FORBIDDEN,
      );
    }

    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);
    const statusFilter = CollectionFilterUtil.buildStatusFilter(query.status);
    const parentConditions = IngredientFilterUtil.buildParentFilter(
      query.parent,
    );

    const matchConditions = {
      isDeleted,
      organization: organizationId,
      ...statusFilter,
      ...(query.search && {
        $or: [
          { label: { $options: 'i', $regex: query.search } },
          { description: { $options: 'i', $regex: query.search } },
        ],
      }),
      ...(query.category && { category: query.category }),
      ...(query.brand &&
        isValidObjectId(query.brand) && {
          brand: query.brand,
        }),
      ...(Object.keys(parentConditions).length > 0 && {
        $and: [parentConditions],
      }),
    };

    const aggregate = PipelineBuilder.create()
      .match(matchConditions)
      .add(...IngredientFilterUtil.buildMetadataLookup())
      .add(...IngredientFilterUtil.buildFormatFilterStage(query.format))
      .sort(handleQuerySort(query.sort))
      .build();

    const data: AggregatePaginateResult<IngredientDocument> =
      await this.ingredientsService.findAll(aggregate, options);
    return serializeCollection(request, IngredientSerializer, data);
  }

  @Get(':organizationId/videos')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAllVideos(
    @Req() request: Request,
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: User,
    @Query() query: VideosQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const publicMetadata = getPublicMetadata(user);
    const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);
    const aggregate: Record<string, unknown>[] = [
      {
        $match: {
          isDeleted,
          organization: organizationId,
          user: publicMetadata.user,
        },
      },
      {
        $sort: handleQuerySort(query.sort),
      },
    ];

    const data: AggregatePaginateResult<IngredientDocument> =
      await this.videosService.findAll(aggregate, options);
    return serializeCollection(request, VideoSerializer, data);
  }

  @Get(':organizationId/tags')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAllTags(
    @Req() request: Request,
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: User,
    @Query() query: BaseQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };
    const publicMetadata = getPublicMetadata(user);
    const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);

    // Build match conditions to return:
    // 1. Global tags (no organization and no user)
    // 2. Tags for this specific organization
    // 3. Tags for the current user
    const aggregate = PipelineBuilder.create()
      .match({
        $or: [
          // Global tags (default/system tags)
          { organization: { $exists: false }, user: { $exists: false } },
          // Tags for this organization
          { organization: organizationId },
          // Tags for the current user
          { user: publicMetadata.user },
        ],
        isDeleted,
      })
      .sort(handleQuerySort(query.sort))
      .build();

    const data: AggregatePaginateResult<TagDocument> =
      await this.tagsService.findAll(aggregate, options);
    return serializeCollection(request, TagSerializer, data);
  }

  @Get(':organizationId/posts')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAllPosts(
    @Req() request: Request,
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: User,
    @Query() query: BaseQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const publicMetadata = getPublicMetadata(user);
    await this.verifyOrganizationAccess(
      organizationId,
      publicMetadata.user,
      getIsSuperAdmin(user, request),
    );

    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);
    const aggregate: Record<string, unknown>[] = [
      {
        $match: {
          isDeleted,
          organization: organizationId,
        },
      },
      {
        $lookup: {
          as: 'ingredients',
          foreignField: '_id',
          from: 'ingredients',
          localField: 'ingredients',
        },
      },
      {
        $addFields: {
          ingredients: {
            $map: {
              as: 'ing',
              in: {
                _id: '$$ing._id',
                category: '$$ing.category',
                status: '$$ing.status',
              },
              input: '$ingredients',
            },
          },
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
          pipeline: [
            {
              $group: {
                _id: null,
                avgEngagementRate: { $avg: '$engagementRate' },
                totalComments: { $sum: '$totalComments' },
                totalLikes: { $sum: '$totalLikes' },
                totalSaves: { $sum: '$totalSaves' },
                totalShares: { $sum: '$totalShares' },
                totalViews: { $sum: '$totalViews' },
              },
            },
          ],
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
      {
        $sort: handleQuerySort(query.sort),
      },
    ];

    const data: AggregatePaginateResult<PostDocument> =
      await this.postsService.findAll(aggregate, options);
    return serializeCollection(request, PostSerializer, data);
  }

  @Get(':organizationId/activities')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAllActivities(
    @Req() request: Request,
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: User,
    @Query() query: BaseQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const publicMetadata = getPublicMetadata(user);
    await this.verifyOrganizationAccess(
      organizationId,
      publicMetadata.user,
      getIsSuperAdmin(user, request),
    );

    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);
    const aggregate: Record<string, unknown>[] = [
      {
        $match: {
          isDeleted,
          organization: organizationId,
        },
      },
      ...ActivitiesService.buildEntityLookup(),
      {
        $sort: query.sort
          ? handleQuerySort(query.sort)
          : ({ createdAt: -1, key: 1, label: 1 } as SortObject),
      },
    ];

    const data: AggregatePaginateResult<ActivityDocument> =
      await this.activitiesService.findAll(aggregate, options);
    return serializeCollection(request, ActivitySerializer, data);
  }

  // Analytics route moved to organizations-relationships.controller.ts
  // Use GET /organizations/:organizationId/analytics with query parameters (startDate, endDate, brandId)

  /**
   * GET /organizations/mine
   * Returns all organizations the current user belongs to (as member or owner).
   * Cross-org by design — no single-org auth scoping.
   */
  @Get('mine')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findMine(@CurrentUser() user: User): Promise<unknown[]> {
    const publicMetadata = getPublicMetadata(user);
    const userId = publicMetadata.user;

    if (!userId) {
      throw new HttpException(
        { detail: 'User not found in metadata', title: 'Bad Request' },
        HttpStatus.BAD_REQUEST,
      );
    }

    // Find all memberships for this user
    const members = await this.membersService.find({
      isActive: true,
      isDeleted: false,
      user: userId,
    });

    if (!members.length) {
      return [];
    }

    const orgIds = members.map((m) => m.organization);

    // Fetch all organizations
    const orgs = await Promise.all(
      orgIds.map((orgId) =>
        this.organizationsService.findOne({
          _id: orgId,
          isDeleted: false,
        }),
      ),
    );

    // Fetch default brand per org
    const results = await Promise.all(
      orgs
        .filter((org): org is NonNullable<typeof org> => org !== null)
        .map(async (org) => {
          const brand = await this.brandsService.findOne({
            isDeleted: false,
            organization: org._id,
          });
          return {
            brand: brand
              ? { id: brand._id.toString(), label: brand.label }
              : null,
            id: org._id.toString(),
            isActive: publicMetadata.organization === org._id.toString(),
            label: org.label,
            slug: org.slug ?? '',
          };
        }),
    );

    return results;
  }

  /**
   * POST /organizations/switch/:id
   * Switch the active organization for the current user.
   * Updates Clerk publicMetadata with the new organization + brand.
   */
  @Post('switch/:id')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async switchOrganization(
    @Param('id') orgId: string,
    @CurrentUser() user: User,
  ): Promise<unknown> {
    const publicMetadata = getPublicMetadata(user);
    const userId = publicMetadata.user;

    if (!userId) {
      throw new HttpException(
        { detail: 'User not found in metadata', title: 'Bad Request' },
        HttpStatus.BAD_REQUEST,
      );
    }

    // Verify membership
    const member = await this.membersService.findOne({
      isActive: true,
      isDeleted: false,
      organization: orgId,
      user: userId,
    });

    if (!member && !getIsSuperAdmin(user)) {
      throw new HttpException(
        {
          detail: 'You are not a member of this organization',
          title: 'Forbidden',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    // Prefer the member's last-used brand; fall back to any brand in the org
    let brand = null;
    if (member?.lastUsedBrand) {
      brand = await this.brandsService.findOne({
        _id: member.lastUsedBrand,
        isDeleted: false,
        organization: orgId,
      });
    }
    if (!brand) {
      brand = await this.brandsService.findOne({
        isDeleted: false,
        organization: orgId,
      });
    }

    if (!brand) {
      throw new HttpException(
        { detail: 'No brand found for this organization', title: 'Not Found' },
        HttpStatus.NOT_FOUND,
      );
    }

    // Update Clerk publicMetadata
    await this.clerkService.updateUserPublicMetadata(user.id, {
      brand: brand._id.toString(),
      organization: orgId,
    });

    const org = await this.organizationsService.findOne({
      _id: orgId,
      isDeleted: false,
    });

    return {
      brand: { id: brand._id.toString(), label: brand.label },
      organization: { id: orgId, label: org?.label ?? '' },
    };
  }

  /**
   * POST /organizations/create
   * Create a new organization for the current user.
   * Seeds org settings, brand, and member records.
   * Switches the user's active org to the newly created one.
   */
  @Post('create')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async createOrganization(
    @Body() body: { label: string; description?: string },
    @CurrentUser() user: User,
  ): Promise<unknown> {
    const publicMetadata = getPublicMetadata(user);
    const userId = publicMetadata.user;

    if (!userId) {
      throw new HttpException(
        { detail: 'User not found in metadata', title: 'Bad Request' },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!body?.label?.trim()) {
      throw new HttpException(
        { detail: 'Organization name is required', title: 'Bad Request' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const userDoc = await this.usersService.findOne({
      _id: userId,
      isDeleted: false,
    });

    if (!userDoc) {
      throw new HttpException(
        { detail: 'User document not found', title: 'Not Found' },
        HttpStatus.NOT_FOUND,
      );
    }

    // Step 1: Create organization
    const org = await this.organizationsService.create(
      new OrganizationEntity({
        isSelected: false,
        label: body.label.trim(),
        user: userId,
      }),
    );

    const orgId = org._id;

    // Step 2: Create org settings
    const enabledModelIds =
      await this.organizationSettingsService.getLatestMajorVersionModelIds();
    await this.organizationSettingsService.create({
      brandsLimit: 5,
      enabledModels: enabledModelIds,
      isAutoEvaluateEnabled: false,
      isGenerateArticlesEnabled: false,
      isGenerateImagesEnabled: true,
      isGenerateMusicEnabled: true,
      isGenerateVideosEnabled: true,
      isNotificationsDiscordEnabled: false,
      isNotificationsEmailEnabled: true,
      isVerifyIngredientEnabled: true,
      isVerifyScriptEnabled: true,
      isVerifyVideoEnabled: true,
      isVoiceControlEnabled: false,
      isWatermarkEnabled: true,
      isWebhookEnabled: false,
      isWhitelabelEnabled: false,
      organization: orgId,
      seatsLimit: 3,
      timezone: 'UTC',
    } as unknown as Parameters<
      typeof this.organizationSettingsService.create
    >[0]);

    // Step 3: Create default brand
    const brand = await this.brandsService.create(
      new BrandEntity({
        backgroundColor: '#000000',
        description:
          body.description ?? 'Default description. Use it as a pre-prompt',
        fontFamily: 'montserrat-black',
        handle: generateLabel('brand'),
        isSelected: true,
        label: body.label.trim(),
        organization: orgId,
        primaryColor: '#000000',
        secondaryColor: '#FFFFFF',
        user: userId,
      }),
    );

    // Step 4: Find admin role and create member
    let adminRole = await this.rolesService.findOne({
      isDeleted: false,
      key: 'admin',
    });
    if (!adminRole) {
      adminRole = await this.rolesService.findOne({
        isDeleted: false,
        key: 'user',
      });
    }

    if (!adminRole) {
      throw new HttpException(
        { detail: 'No role found to assign', title: 'Internal Server Error' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    await this.membersService.create(
      new MemberEntity({
        isActive: true,
        organization: orgId,
        role: adminRole._id,
        user: userId,
      }),
    );

    // Step 5: Update Clerk publicMetadata to switch to new org
    await this.clerkService.updateUserPublicMetadata(user.id, {
      brand: brand._id.toString(),
      organization: org._id.toString(),
    });

    await Promise.all([
      this.requestContextCacheService.invalidateForUser(user.id),
      this.accessBootstrapCacheService.invalidateForUser(user.id),
    ]);

    return {
      brand: { id: brand._id.toString(), label: brand.label },
      organization: { id: org._id.toString(), label: org.label },
    };
  }
}
