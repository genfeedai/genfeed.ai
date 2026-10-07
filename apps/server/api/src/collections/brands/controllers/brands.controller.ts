import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ArticlesService } from '@api/collections/articles/services/articles.service';
import { STRATEGY_TEMPLATES } from '@api/collections/brands/constants/strategy-templates.constant';
import {
  assertBrandHandleAvailable,
  findBrandToRelocate,
  verifyBrandAccess,
  verifyBrandSlugAccess,
} from '@api/collections/brands/controllers/brand-access.helpers';
import { decorateBrandResponse } from '@api/collections/brands/controllers/brand-response.helpers';
import { CreateBrandDto } from '@api/collections/brands/dto/create-brand.dto';
import { UpdateBrandDto } from '@api/collections/brands/dto/update-brand.dto';
import { type BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import { BrandSetupService } from '@api/collections/brands/services/brand-setup.service';
import { BrandWatermarkLogoService } from '@api/collections/brands/services/brand-watermark-logo.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ImagesService } from '@api/collections/images/services/images.service';
import { LinksService } from '@api/collections/links/services/links.service';
import { MusicsService } from '@api/collections/musics/services/musics.service';
import { AnalyticsAggregationService } from '@api/collections/posts/services/analytics-aggregation.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { Cache } from '@api/helpers/decorators/cache/cache.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { TenantReadPolicy } from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import { resolveTenantReadScope } from '@api/helpers/interceptors/tenant-context/tenant-read-scope.context';
import { getIsSuperAdmin } from '@api/helpers/utils/auth/auth.util';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import { resolveScopeId } from '@api/shared/controllers/base-crud/base-crud-scope.util';
import { BaseService } from '@api/shared/services/base/base.service';
import { ActivityKey, ActivitySource } from '@genfeedai/contracts';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/contracts/interfaces';
import { BrandSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { crossOrgUnsafe } from '@libs/prisma/tenant-context';
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('brands')
@UseGuards(RolesGuard)
export class BrandsController extends BaseCRUDController<
  BrandDocument,
  CreateBrandDto,
  UpdateBrandDto,
  BaseQueryDto
> {
  constructor(
    public readonly brandsService: BrandsService,
    public readonly activityRecorder: ActivityRecorderService,
    public readonly videosService: VideosService,
    public readonly imagesService: ImagesService,
    public readonly articlesService: ArticlesService,
    public readonly musicsService: MusicsService,
    public readonly credentialsService: CredentialsService,
    public readonly linksService: LinksService,
    public readonly postsService: PostsService,
    public readonly analyticsAggregationService: AnalyticsAggregationService,
    public readonly loggerService: LoggerService,
    private readonly brandSetupService: BrandSetupService,
    private readonly brandWatermarkLogoService: BrandWatermarkLogoService,
  ) {
    super(
      loggerService,
      brandsService as unknown as BaseService<
        BrandDocument,
        CreateBrandDto,
        UpdateBrandDto
      >,
      BrandSerializer,
      'Brand',
    );
  }
  protected override removeEntity(brand: BrandDocument, id: string) {
    return this.brandsService.removeInOrganization(brand.organizationId, id);
  }

  /**
   * Brand PATCHes never persist the generic CRUD controller's session relation
   * aliases. Prisma treats `brand`, `organization`, and `user` as nested
   * relation inputs, so scalar session ids under those keys are invalid update
   * data. Authorization has already consumed the request context before this
   * hook runs; only explicit brand fields belong in the persistence payload.
   */
  public override enrichUpdateDto(
    updateDto: Partial<UpdateBrandDto>,
    _user: User,
  ): Promise<UpdateBrandDto> {
    const {
      brand: _brand,
      brandId: _brandId,
      organization: _organization,
      user: _owner,
      userId: _ownerId,
      ...brandFields
    } = updateDto as Partial<UpdateBrandDto> & {
      brand?: unknown;
      brandId?: unknown;
      organization?: unknown;
      user?: unknown;
      userId?: unknown;
    };

    // Drop declared-but-absent DTO fields so Prisma never sees `undefined`
    // values (class-field semantics materialize them on the instance).
    const definedFields = Object.fromEntries(
      Object.entries(brandFields as Record<string, unknown>).filter(
        ([, value]) => value !== undefined,
      ),
    );

    return Promise.resolve(definedFields as UpdateBrandDto);
  }

  /**
   * PATCH/DELETE: the base creator-only `userId` rule, inside the session
   * organization — a creator cannot modify their brand from another org.
   */
  public override canUserModifyEntity(
    user: User,
    entity: BrandDocument,
  ): boolean {
    const organizationId = resolveScopeId(entity.organizationId);
    return (
      Boolean(organizationId) &&
      organizationId === user.organizationId &&
      super.canUserModifyEntity(user, entity)
    );
  }

  /**
   * Update a brand. Overrides the base handler to detect an organization change:
   * when `organizationId` differs from the brand's current org, the update becomes a
   * relocation — cascading the denormalized org id across all brand-owned records in
   * one transaction (authorized as superadmin, or owner/admin of both orgs). All
   * other updates fall through to the default CRUD patch unchanged.
   */
  @Patch(':id')
  async patch(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() updateDto: UpdateBrandDto,
  ): Promise<JsonApiSingleResponse> {
    // `syncOrganizationName` is an onboarding-only control flag, never persisted
    // on the brand row — strip it before any CRUD patch (REST audit #1354).
    const { organizationLabel, syncOrganizationName, ...rest } =
      updateDto as UpdateBrandDto & {
        organizationLabel?: string;
        syncOrganizationName?: boolean;
      };

    if (rest.watermarkLogoId) {
      await this.brandWatermarkLogoService.validateWatermarkLogo(
        id,
        user.organizationId.toString(),
        rest.watermarkLogoId,
      );
    }

    const requestedOrgId = (rest as { organizationId?: string }).organizationId;
    // A relocation checks the handle itself, after authorizing both orgs.
    const handleCheck = {
      brandId: id,
      isSuperAdmin: getIsSuperAdmin(user, request),
      slug: rest.slug,
      user,
    };
    if (!requestedOrgId) {
      await assertBrandHandleAvailable(this.brandsService, handleCheck);
    }

    if (rest.agentConfig !== undefined && !syncOrganizationName) {
      throw new BadRequestException(
        'Use the brand agent-config endpoint to update agentConfig',
      );
    }

    // Brand rename that cascades to the owning organization's name/slug. The
    // cascade itself is gated server-side to the first-login window inside the
    // service, so this flag cannot rename an established organization.
    const label = (rest as { label?: string }).label;
    if (syncOrganizationName && typeof label === 'string' && label.trim()) {
      await verifyBrandAccess(this.brandsService, id, user);
      const onboardingProfileOptions = {
        ...(typeof rest.agentConfig === 'object' && rest.agentConfig !== null
          ? { agentConfig: rest.agentConfig }
          : {}),
        ...(typeof rest.description === 'string'
          ? { description: rest.description }
          : {}),
        ...(typeof organizationLabel === 'string'
          ? { organizationName: organizationLabel }
          : {}),
        ...(typeof rest.text === 'string' ? { text: rest.text } : {}),
      };
      await this.brandSetupService.updateBrandNameById(
        id,
        label,
        user,
        onboardingProfileOptions,
      );
      const renamed = await verifyBrandAccess(this.brandsService, id, user);
      return serializeSingle(
        request,
        BrandSerializer,
        renamed ? await this.decorateForResponse(renamed, user) : renamed,
      );
    }

    // No org change requested → default CRUD patch.
    if (!requestedOrgId) {
      return super.patch(request, user, id, rest as UpdateBrandDto);
    }

    const existing = (await findBrandToRelocate(this.brandsService, id)) as
      | (BrandDocument & { organizationId?: string })
      | null;
    if (!existing) {
      throw new HttpException(
        { detail: `Brand ${id} not found`, title: 'Not Found' },
        HttpStatus.NOT_FOUND,
      );
    }

    // Same org → not a relocation; apply the remaining fields via the default patch.
    // Strip the org trigger — it is not a Brand column, so a retry that lands here
    // after the move already committed would otherwise try to persist it.
    if (existing.organizationId === requestedOrgId) {
      const { organizationId: _omitOrg, ...fields } = rest as Record<
        string,
        unknown
      >;
      await assertBrandHandleAvailable(this.brandsService, handleCheck);
      return super.patch(request, user, id, fields as UpdateBrandDto);
    }

    // A relocation spans the source and destination tenants; authorization
    // (superadmin, or owner/admin of both orgs) is the service's
    // assertCanRelocate.
    const { brand: moved, summary } = await crossOrgUnsafe(
      async () =>
        await this.brandsService.relocateToOrganization(id, updateDto, {
          isSuperAdmin: getIsSuperAdmin(user, request),
          userId: user.userId ?? user.id,
        }),
    );

    await this.activityRecorder.record({
      brandId: id,
      key: ActivityKey.BRAND_RELOCATED,
      organizationId: requestedOrgId,
      source: ActivitySource.BRAND_RELOCATION,
      userId: user.userId ?? user.id,
      value: JSON.stringify(summary),
    });

    return {
      ...serializeSingle(
        request,
        BrandSerializer,
        await this.decorateForResponse(moved, user),
      ),
      meta: { ...summary },
    };
  }

  /**
   * Preview the impact of relocating a brand to another organization: which
   * brand-owned resources move with it, and how many members lose access.
   */
  @Get(':id/relocation-preview')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async previewRelocation(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Query('organizationId') organizationId: string,
  ) {
    if (!organizationId) {
      throw new BadRequestException(
        'organizationId query parameter is required',
      );
    }

    // Counts resources across source and destination tenants; see patch().
    const preview = await crossOrgUnsafe(
      async () =>
        await this.brandsService.previewRelocation(id, organizationId, {
          isSuperAdmin: getIsSuperAdmin(user, request),
          userId: user.userId ?? user.id,
        }),
    );

    return { data: preview };
  }

  @Post()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() createDto: CreateBrandDto,
  ): Promise<JsonApiSingleResponse> {
    const enrichedDto = this.enrichCreateDto(createDto, user);
    const data: BrandDocument = await this.brandsService.create(enrichedDto);

    return serializeSingle(request, BrandSerializer, data);
  }

  /**
   * One organization's brands: superadmins may filter by `organizationId`, all
   * others get their session org. Creating a brand elsewhere never widens it.
   */
  public buildFindAllQuery(user: User, query: BaseQueryDto) {
    const adminFilter = CollectionFilterUtil.buildAdminFilter(user, query);

    const isDeleted = query.isDeleted ?? false;

    if (adminFilter) {
      return {
        orderBy: handleQuerySort(query.sort),
        where: { isDeleted, ...adminFilter },
      };
    }

    const scope = CollectionFilterUtil.resolveAuthorizedTenantQuery(
      query,
      user,
      false,
    );
    const organizationId = scope.organizationId ?? user.organizationId;

    if (!organizationId) {
      throw new ForbiddenException('Organization not found in session');
    }

    return {
      orderBy: handleQuerySort(query.sort),
      where: { isDeleted, organizationId },
    };
  }

  @Get('agent-config/strategy-templates')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  getStrategyTemplates() {
    return { data: STRATEGY_TEMPLATES };
  }

  @Get()
  // No @RolesDecorator('superadmin'): members list brands for their org via
  // `GET /brands?organization=`. Class-level RolesGuard still requires auth +
  // org membership.
  @Cache({
    keyGenerator: (req) =>
      `brands:list:user:${req.user?.id ?? 'anonymous'}:query:${JSON.stringify(req.query)}`,
    tags: ['brands'],
    ttl: 1_800, // 30 minutes
  })
  findAll(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: BaseQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    // buildAdminFilter only yields a filter for superadmins, who may list
    // another organization's brands (or one brand across organizations).
    if (CollectionFilterUtil.buildAdminFilter(user, query)) {
      return crossOrgUnsafe(
        async () => await super.findAll(request, user, query),
      );
    }

    return super.findAll(request, user, query);
  }

  /** Logos and connected accounts for list rows, batched per organization. */
  public override decorateListForResponse(
    docs: BrandDocument[],
  ): Promise<BrandDocument[]> {
    // The rows are already authorized; a superadmin list spans organizations
    // and each relation read is pinned to its brand's own organizationId.
    return crossOrgUnsafe(
      async () => await this.brandsService.attachBrandListRelations(docs),
    );
  }

  @TenantReadPolicy('selected')
  @Get('slug')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findOneBySlug(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query('slug') slug: string,
  ): Promise<JsonApiSingleResponse> {
    if (!slug) {
      throw new BadRequestException('slug query param is required');
    }

    const brand = await verifyBrandSlugAccess(
      this.brandsService,
      slug,
      user,
      resolveTenantReadScope(user),
    );

    return serializeSingle(
      request,
      BrandSerializer,
      await this.decorateForResponse(brand, user),
    );
  }

  /**
   * Resolve the brand's logo, banner and reference assets onto the response.
   *
   * The serializer declares them as asset relations, but the Brand table has no
   * such columns — they are `Asset` rows keyed by `parentBrandId`. Without this
   * the relations serialize as absent, and the brand setup checklist reports a
   * missing logo for a brand that has one.
   */
  public override async decorateForResponse(
    brand: BrandDocument,
    _user: User,
  ): Promise<BrandDocument> {
    return decorateBrandResponse(
      brand,
      this.brandsService,
      this.credentialsService,
    );
  }

  /**
   * Override findOne WITHOUT caching
   *
   * IMPORTANT: Caching disabled because brand has virtual populated fields
   * (links, credentials, references, logo, banner) resolved from related data.
   * Caching those relation-heavy payloads causes stale data when related
   * collections update.
   * This matches the org.settings solution where we bypass population for fresh data.
   */
  @TenantReadPolicy('selected')
  @Get(':brandId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findOne(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('brandId') brandId: string,
  ): Promise<JsonApiSingleResponse> {
    await verifyBrandAccess(
      this.brandsService,
      brandId,
      user,
      resolveTenantReadScope(user),
    );

    return super.findOne(request, user, brandId);
  }
}
