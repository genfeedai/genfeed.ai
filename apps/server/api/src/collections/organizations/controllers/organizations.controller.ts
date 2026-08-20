import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { DefaultRecurringContentService } from '@api/collections/brands/services/default-recurring-content.service';
import { MembersService } from '@api/collections/members/services/members.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { DEFAULT_FREE_SEATS } from '@api/collections/organization-settings/utils/seat-policy.util';
import { CreateOrganizationDto } from '@api/collections/organizations/dto/create-organization.dto';
import { OrganizationQueryDto } from '@api/collections/organizations/dto/organization-query.dto';
import type { UpdateOrganizationDto } from '@api/collections/organizations/dto/update-organization.dto';
import type { OrganizationDocument } from '@api/collections/organizations/schemas/organization.schema';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { RolesService } from '@api/collections/roles/services/roles.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { UserAccessCacheService } from '@api/common/services/user-access-cache.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { PlanLimitExceededException } from '@api/helpers/exceptions/business/business-logic.exception';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import {
  getIsSuperAdmin,
  getSubscriptionTier,
} from '@api/helpers/utils/auth/auth.util';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import { generateLabel } from '@api/shared/utils/label/label.util';
import type { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import { isCloudDeployment } from '@genfeedai/config';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
  OrganizationOption,
} from '@genfeedai/interfaces';
import {
  getOrganizationLimitForTier,
  getUpgradeTierForLimit,
} from '@genfeedai/pricing';
import { OrganizationSerializer } from '@genfeedai/serializers';
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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
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
    private readonly membersService: MembersService,
    private readonly organizationsService: OrganizationsService,
    private readonly defaultRecurringContentService: DefaultRecurringContentService,
    private readonly usersService: UsersService,
    private readonly rolesService: RolesService,
    private readonly organizationSettingsService: OrganizationSettingsService,
    private readonly userAccessCacheService: UserAccessCacheService,
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
   * Organization rows carry no `organizationId`/`brandId` pointer, so the base
   * containment default would fail open on GET /organizations/:id. Scope the
   * read to the active org, ownership, or an active membership instead — the
   * same access rule applies to the sub-resources (see
   * OrganizationsRelationshipsController.verifyOrganizationAccess).
   */
  public override async canUserReadEntity(
    user: User,
    entity: OrganizationDocument,
  ): Promise<boolean> {
    const organizationId = entity?.id?.toString();

    if (!organizationId || !(user.userId ?? user.id)) {
      return false;
    }

    if (organizationId === user.organizationId) {
      return true;
    }

    if (this.isOrganizationOwner(entity, user.userId ?? user.id)) {
      return true;
    }

    const member = await this.membersService.findOne({
      isActive: true,
      organizationId: organizationId,
      userId: user.userId ?? user.id,
    });

    return Boolean(member);
  }

  /**
   * GET /organizations/by-slug/:slug
   * Resolve an organization by its URL-friendly slug.
   *
   * Bespoke route: the base findOne gate never runs for it, so it applies
   * canUserReadEntity itself rather than defining a second access rule. A
   * denied read and an unknown slug throw the identical 404 so a slug probe
   * can't distinguish "exists, but not yours" from "does not exist".
   */
  @Get('by-slug/:slug')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findBySlug(
    @Req() request: Request,
    @Param('slug') slug: string,
    @CurrentUser() user: User,
  ): Promise<unknown> {
    const org = await this.organizationsService.findBySlug(slug);
    const notFound = (): NotFoundException =>
      new NotFoundException({
        message: `Organization with slug "${slug}" not found`,
      });

    if (!org) {
      throw notFound();
    }

    if (
      !(await this.canUserReadEntity(user, org)) &&
      !getIsSuperAdmin(user, request)
    ) {
      throw notFound();
    }

    return serializeSingle(request, OrganizationSerializer, org);
  }

  /**
   * List organizations.
   *
   * - `?mine=true` — membership summaries for the current user (cross-org).
   * - default — platform-wide list (superadmin only).
   */
  findAll(
    request: Request,
    user: User,
    query: OrganizationQueryDto & { readonly mine: true },
  ): Promise<OrganizationOption[]>;
  findAll(
    request: Request,
    user: User,
    query: OrganizationQueryDto,
  ): Promise<JsonApiCollectionResponse>;
  @Get()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAll(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: OrganizationQueryDto,
  ): Promise<JsonApiCollectionResponse | OrganizationOption[]> {
    if (query.mine) {
      return this.findMine(user);
    }

    // Must pass request: self-host hydrates the request-context admin flag,
    // while hosted auth derives the same capability from users.platformRole.
    // Checking user alone 403s platform admins who only have the context bit
    // (local Portless / self-host) — same split that SuperAdminGuard avoids.
    if (!getIsSuperAdmin(user, request)) {
      throw new HttpException(
        {
          detail: 'Platform superadmin access is required',
          title: 'Forbidden',
        },
        HttpStatus.FORBIDDEN,
      );
    }

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

  // Sub-resource collection routes (ingredients, videos, tags, analytics)
  // live in organizations-relationships.controller.ts. Prefer flat lists for
  // brands/posts/activities: GET /brands?organization=, /posts?organization=,
  // /activities?organization=.

  /**
   * Create a new organization (collection POST).
   * Seeds settings, brand, member; switches active org.
   * Overrides BaseCRUD create: response is `{ organization, brand }`, not a
   * serialized Organization document alone.
   */
  @Post()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  override async create(
    @Req() _request: Request,
    @CurrentUser() user: User,
    @Body() createDto: CreateOrganizationDto,
  ): Promise<JsonApiSingleResponse> {
    const result = await this.createOrganization(
      {
        description: (createDto as { description?: string }).description,
        label: createDto.label,
      },
      user,
    );
    // Seeded create returns a custom payload (org + brand), not a single
    // Organization JSON:API document. Cast keeps the BaseCRUD signature.
    return result as JsonApiSingleResponse;
  }

  /**
   * Membership summaries for the current user (cross-org).
   * Invoked via `GET /organizations?mine=true`.
   */
  async findMine(user: User): Promise<OrganizationOption[]> {
    const userId = user.userId ?? user.id;

    if (!userId) {
      throw new HttpException(
        { detail: 'User not found in metadata', title: 'Bad Request' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const members = await this.membersService.findActiveForUserAccess(userId);

    // A missing organization ID must not reach findOne because an undefined
    // unique filter can normalize to an unscoped findFirst.
    // Dedup so multiple memberships in one org can't render duplicate entries.
    const membershipOrgIds = [
      ...new Set(
        members.map((member) => member.organizationId).filter(Boolean),
      ),
    ];
    const orgIds =
      membershipOrgIds.length > 0
        ? membershipOrgIds
        : user.organizationId
          ? [user.organizationId]
          : [];

    if (!orgIds.length) {
      return [];
    }

    // Fetch all organizations
    const orgs = await Promise.all(
      orgIds.map((orgId) =>
        this.organizationsService.findOne({
          id: orgId,
        }),
      ),
    );

    // Fetch default brand per org
    const results = await Promise.all(
      orgs
        .filter((org): org is NonNullable<typeof org> => org !== null)
        .map(async (org) => {
          const brand = await this.brandsService.findOne({
            organizationId: org.id,
          });
          return {
            brand: brand
              ? { id: brand.id.toString(), label: brand.label }
              : null,
            id: org.id.toString(),
            isActive: user.organizationId === org.id.toString(),
            isOwner: this.isOrganizationOwner(org, userId),
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
   * Updates legacy auth provider user with the new organization + brand.
   */
  @Post('switch/:id')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async switchOrganization(
    @Param('id') orgId: string,
    @CurrentUser() user: User,
  ): Promise<unknown> {
    const userId = user.userId ?? user.id;

    if (!userId) {
      throw new HttpException(
        { detail: 'User not found in metadata', title: 'Bad Request' },
        HttpStatus.BAD_REQUEST,
      );
    }

    // Verify membership
    const member = await this.membersService.findOne({
      isActive: true,
      organizationId: orgId,
      userId: userId,
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
        id: member.lastUsedBrandId,
        organizationId: orgId,
      });
    }
    if (!brand) {
      brand = await this.brandsService.findOne({
        organizationId: orgId,
      });
    }

    if (!brand) {
      throw new HttpException(
        { detail: 'No brand found for this organization', title: 'Not Found' },
        HttpStatus.NOT_FOUND,
      );
    }

    // Persist the active org + brand to the DB so both identity resolvers route
    // to this org on the next request (epic #735, Phase C — no legacy auth provider write-back).
    await this.usersService.patch(userId, { lastUsedOrganizationId: orgId });
    if (member) {
      await this.membersService.setLastUsedBrand(
        {
          isActive: true,
          isDeleted: false,
          organizationId: orgId,
          userId,
        },
        brand.id.toString(),
      );
    }
    await this.userAccessCacheService.invalidateAll(userId);

    const org = await this.organizationsService.findOne({
      id: orgId,
    });

    return {
      brand: { id: brand.id.toString(), label: brand.label },
      organization: { id: orgId, label: org?.label ?? '' },
    };
  }

  /**
   * Shared create implementation for `POST /organizations`.
   */
  async createOrganization(
    body: { label: string; description?: string },
    user: User,
  ): Promise<unknown> {
    const userId = user.userId ?? user.id;

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

    await this.assertOrganizationCreationAllowed(user, userId);

    const userDoc = await this.usersService.findOne({
      id: userId,
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
    });

    const orgId = org.id;

    // Step 2: Create org settings
    const enabledModelIds =
      await this.organizationSettingsService.getLatestMajorVersionModelIds();
    await this.organizationSettingsService.create({
      brandsLimit: 0,
      enabledModelIds,
      isAutoEvaluateEnabled: false,
      isGenerateArticlesEnabled: false,
      isGenerateImagesEnabled: true,
      isGenerateMusicEnabled: true,
      isGenerateVideosEnabled: true,
      isNotificationsDiscordEnabled: false,
      isNotificationsTelegramEnabled: false,
      isNotificationsEmailEnabled: true,
      isVerifyIngredientEnabled: true,
      isVerifyScriptEnabled: true,
      isVerifyVideoEnabled: true,
      isVoiceControlEnabled: false,
      isWatermarkEnabled: true,
      isWebhookEnabled: false,
      isWhitelabelEnabled: false,
      organizationId: orgId,
      seatsLimit: DEFAULT_FREE_SEATS,
      timezone: 'UTC',
    });

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

    await this.provisionDefaultRecurringWorkflows(
      orgId.toString(),
      brand.id.toString(),
      userId,
    );

    // Step 4: Find admin role and create member
    let adminRole = await this.rolesService.findOne({
      key: 'admin',
    });
    if (!adminRole) {
      adminRole = await this.rolesService.findOne({
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
      roleId: String(adminRole.id),
      userId,
    } as unknown as Parameters<typeof this.membersService.create>[0]);

    // Step 5: Switch the user to the new org via DB pointers (epic #735, Phase C
    // — no legacy auth provider write-back). Both identity resolvers pick up
    // lastUsedOrganizationId + the member's lastUsedBrandId on the next request.
    await this.usersService.patch(userId, {
      lastUsedOrganizationId: org.id.toString(),
    });
    await this.membersService.setLastUsedBrand(
      {
        isActive: true,
        isDeleted: false,
        organizationId: org.id.toString(),
        userId,
      },
      brand.id.toString(),
    );

    await this.userAccessCacheService.invalidateAll(userId);

    return {
      brand: { id: brand.id.toString(), label: brand.label },
      organization: { id: org.id.toString(), label: org.label },
    };
  }

  private async assertOrganizationCreationAllowed(
    user: User,
    userId: string,
  ): Promise<void> {
    if (!isCloudDeployment() || getIsSuperAdmin(user)) {
      return;
    }

    const settings = user.organizationId
      ? await this.organizationSettingsService.findOne({
          organizationId: user.organizationId,
        })
      : null;

    const tier = settings?.subscriptionTier ?? getSubscriptionTier(user);
    const organizationLimit = getOrganizationLimitForTier(tier);

    if (organizationLimit === null) {
      return;
    }

    const organizationCount = await this.organizationsService.count({
      isDeleted: false,
      userId,
    });

    if (organizationCount < organizationLimit) {
      return;
    }

    throw new PlanLimitExceededException({
      currentCount: organizationCount,
      limit: organizationLimit,
      resource: 'organizations',
      upgradeTier: getUpgradeTierForLimit('organizations', tier),
    });
  }

  private isOrganizationOwner(
    organization: { userId?: string | null },
    userId: string,
  ): boolean {
    return organization.userId === userId;
  }

  private async provisionDefaultRecurringWorkflows(
    organizationId: string,
    brandId: string,
    userId: string,
  ): Promise<void> {
    try {
      await this.defaultRecurringContentService.ensureDefaultBundle({
        brandId,
        organizationId,
        origin: 'brand-create',
        userId,
      });
    } catch (error: unknown) {
      this.loggerService.error(
        'Failed to provision default recurring workflows',
        {
          brandId,
          error: (error as Error)?.message,
          organizationId,
          stack: (error as Error)?.stack,
        },
      );
    }
  }
}
