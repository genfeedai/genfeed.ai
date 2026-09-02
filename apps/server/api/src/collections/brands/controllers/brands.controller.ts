import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ActivityEntity } from '@api/collections/activities/entities/activity.entity';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { ArticlesService } from '@api/collections/articles/services/articles.service';
import { STRATEGY_TEMPLATES } from '@api/collections/brands/constants/strategy-templates.constant';
import { verifyBrandAccess } from '@api/collections/brands/controllers/brand-access.helpers';
import { CreateBrandDto } from '@api/collections/brands/dto/create-brand.dto';
import { UpdateBrandDto } from '@api/collections/brands/dto/update-brand.dto';
import { type BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import { BrandSetupService } from '@api/collections/brands/services/brand-setup.service';
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
import { getIsSuperAdmin } from '@api/helpers/utils/auth/auth.util';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import { BaseService } from '@api/shared/services/base/base.service';
import {
  ActivityKey,
  ActivitySource,
  fromPrismaCredentialPlatform,
} from '@genfeedai/contracts';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/contracts/interfaces';
import { BrandSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Body,
  Controller,
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
    public readonly activitiesService: ActivitiesService,
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
      const renamed = await this.brandsService.findOne({ id: id });
      return serializeSingle(
        request,
        BrandSerializer,
        renamed ? await this.decorateForResponse(renamed, user) : renamed,
      );
    }

    const requestedOrgId = (rest as { organizationId?: string }).organizationId;

    // No org change requested → default CRUD patch.
    if (!requestedOrgId) {
      return super.patch(request, user, id, rest as UpdateBrandDto);
    }

    const existing = (await this.brandsService.findOne({ id: id })) as
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
      return super.patch(request, user, id, fields as UpdateBrandDto);
    }

    const { brand: moved, summary } =
      await this.brandsService.relocateToOrganization(id, updateDto, {
        isSuperAdmin: getIsSuperAdmin(user, request),
        userId: user.userId ?? user.id,
      });

    await this.activitiesService.create(
      new ActivityEntity({
        brandId: id,
        key: ActivityKey.BRAND_RELOCATED,
        organizationId: requestedOrgId,
        source: ActivitySource.BRAND_RELOCATION,
        userId: user.userId ?? user.id,
        value: JSON.stringify(summary),
      }),
    );

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

    const preview = await this.brandsService.previewRelocation(
      id,
      organizationId,
      {
        isSuperAdmin: getIsSuperAdmin(user, request),
        userId: user.userId ?? user.id,
      },
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
   * List brands for the caller. Superadmins may pass `organization`/`brand`
   * query filters. Members get brands they own or that belong to the requested
   * (or active) organization via `GET /brands?organization=`.
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

    // Members may only filter by their session organization (or omit the param).
    const scope = CollectionFilterUtil.resolveAuthorizedTenantQuery(
      query,
      user,
      false,
    );
    const organizationId = scope.organizationId ?? user.organizationId;

    const orConditions: Record<string, unknown>[] = [
      { userId: user.userId ?? user.id },
    ];
    if (organizationId) {
      orConditions.push({ organizationId });
    }

    return {
      orderBy: handleQuerySort(query.sort),
      where: {
        isDeleted,
        OR: orConditions,
      },
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
    return super.findAll(request, user, query);
  }

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

    const brand = await this.brandsService.findOneBySlug({
      slug,
      OR: [
        { userId: user.userId ?? user.id },
        { organizationId: user.organizationId },
      ],
      isDeleted: false,
    });

    if (!brand) {
      if (!getIsSuperAdmin(user)) {
        throw new HttpException(
          { detail: 'Access denied to this brand', title: 'Forbidden' },
          HttpStatus.FORBIDDEN,
        );
      }
      throw new HttpException(
        { detail: 'Brand not found', title: 'Not Found' },
        HttpStatus.NOT_FOUND,
      );
    }

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
    // The brand's own org owns its assets — never the caller's session org,
    // which differs for a superadmin reading across tenants.
    const organizationId = brand.organizationId;

    if (typeof organizationId !== 'string' || !organizationId) {
      return brand;
    }

    const [decorated] = await this.brandsService.attachBrandKitAssetRelations(
      [brand],
      organizationId,
    );

    return this.attachBrandCredentialRelations(decorated, organizationId);
  }

  /**
   * Resolve the brand's connected accounts onto the response.
   *
   * `brandSerializerConfig` declares `credentials` as a relation, but nothing
   * ever populated it — `findOne`/`findOneBySlug` fetch the brand row with no
   * populate — so every brand came back with zero connected accounts and brand
   * social settings reported "Not connected" for platforms that are linked.
   *
   * `platform` crosses to the domain vocabulary here: the column is the
   * SCREAMING `CredentialPlatform` Prisma enum, while the UI, posts and OAuth
   * routes all speak the lowercase domain `Platform` ids.
   */
  private async attachBrandCredentialRelations(
    brand: BrandDocument,
    organizationId: string,
  ): Promise<BrandDocument> {
    const credentials = await this.credentialsService.find({
      brandId: String(brand.id),
      isDeleted: false,
      organizationId,
    });

    // Copy rather than assign onto the argument: the brand row reaching here is
    // whatever the service returned, and mutating it writes the relation into
    // any cache entry or caller-held reference pointing at the same object.
    return {
      ...brand,
      credentials: credentials.map((credential) => ({
        ...credential,
        platform:
          fromPrismaCredentialPlatform(credential.platform) ??
          credential.platform,
      })),
    };
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
  @Get(':brandId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findOne(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('brandId') brandId: string,
  ): Promise<JsonApiSingleResponse> {
    await verifyBrandAccess(this.brandsService, brandId, user);

    return super.findOne(request, user, brandId);
  }
}
