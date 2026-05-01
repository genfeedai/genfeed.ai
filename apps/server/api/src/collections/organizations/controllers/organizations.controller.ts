import { type ActivityDocument } from '@api/collections/activities/schemas/activity.schema';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { type BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { IngredientsQueryDto } from '@api/collections/ingredients/dto/ingredients-query.dto';
import { type IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MembersService } from '@api/collections/members/services/members.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { CreateOrganizationDto } from '@api/collections/organizations/dto/create-organization.dto';
import { OrganizationQueryDto } from '@api/collections/organizations/dto/organization-query.dto';
import { UpdateOrganizationDto } from '@api/collections/organizations/dto/update-organization.dto';
import type { OrganizationDocument } from '@api/collections/organizations/schemas/organization.schema';
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
      'Organization',
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
    const data: AggregatePaginateResult<OrganizationDocument> =
      await this.organizationsService.findAll(
        {
          orderBy: handleQuerySort(query.sort),
          where: { isDeleted },
        },
        options,
      );
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
    const data: AggregatePaginateResult<BrandDocument> =
      await this.brandsService.findAll(
        {
          include: { credentials: true },
          orderBy: handleQuerySort(query.sort),
          where: {
            OR: [
              { user: publicMetadata.user },
              { organization: organizationId },
            ],
            isDeleted,
          },
        },
        options,
      );
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

    const where = {
      ...(Object.keys(parentConditions).length > 0 ? parentConditions : {}),
      isDeleted,
      organization: organizationId,
      ...statusFilter,
      ...(query.search && {
        OR: [
          { label: { contains: query.search, mode: 'insensitive' } },
          { description: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
      ...(query.category && { category: query.category }),
      ...(query.brand &&
        isValidObjectId(query.brand) && {
          brand: query.brand,
        }),
    };

    const data: AggregatePaginateResult<IngredientDocument> =
      await this.ingredientsService.findAll(
        {
          include: { metadata: true },
          orderBy: handleQuerySort(query.sort),
          where,
        },
        options,
      );
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
    const data: AggregatePaginateResult<IngredientDocument> =
      await this.videosService.findAll(
        {
          orderBy: handleQuerySort(query.sort),
          where: {
            isDeleted,
            organization: organizationId,
            user: publicMetadata.user,
          },
        },
        options,
      );
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

    const data: AggregatePaginateResult<TagDocument> =
      await this.tagsService.findAll(
        {
          orderBy: handleQuerySort(query.sort),
          where: {
            OR: [
              { organizationId: null, userId: null },
              { organization: organizationId },
              { user: publicMetadata.user },
            ],
            isDeleted,
          },
        },
        options,
      );
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
    const data: AggregatePaginateResult<PostDocument> =
      await this.postsService.findAll(
        {
          include: {
            credential: true,
            ingredients: true,
            postAnalytics: true,
          },
          orderBy: handleQuerySort(query.sort),
          where: {
            isDeleted,
            organization: organizationId,
          },
        },
        options,
      );
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
    const data: AggregatePaginateResult<ActivityDocument> =
      await this.activitiesService.findAll(
        {
          orderBy: query.sort
            ? handleQuerySort(query.sort)
            : ({ createdAt: -1, key: 1, label: 1 } as SortObject),
          where: {
            isDeleted,
            organization: organizationId,
          },
        },
        options,
      );
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
    if (member?.lastUsedBrandId) {
      brand = await this.brandsService.findOne({
        _id: member.lastUsedBrandId,
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
    const orgSlug = await this.organizationsService.generateUniqueSlug(
      body.label.trim(),
    );
    const org = await this.organizationsService.create({
      isSelected: false,
      label: body.label.trim(),
      slug: orgSlug,
      userId,
    } as unknown as Parameters<typeof this.organizationsService.create>[0]);

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
      organizationId: orgId,
      seatsLimit: 3,
      timezone: 'UTC',
    } as unknown as Parameters<
      typeof this.organizationSettingsService.create
    >[0]);

    // Step 3: Create default brand
    const brand = await this.brandsService.create({
      backgroundColor: '#000000',
      description:
        body.description ?? 'Default description. Use it as a pre-prompt',
      fontFamily: 'montserrat-black',
      isSelected: true,
      label: body.label.trim(),
      organizationId: orgId,
      primaryColor: '#000000',
      secondaryColor: '#FFFFFF',
      slug: generateLabel('brand'),
      userId,
    } as unknown as Parameters<BrandsService['create']>[0]);

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

    await this.membersService.create({
      isActive: true,
      organizationId: orgId,
      roleId: String(adminRole._id),
      userId,
    } as unknown as Parameters<typeof this.membersService.create>[0]);

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
