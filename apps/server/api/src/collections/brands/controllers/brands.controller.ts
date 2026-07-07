import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ActivityEntity } from '@api/collections/activities/entities/activity.entity';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { ArticlesService } from '@api/collections/articles/services/articles.service';
import { STRATEGY_TEMPLATES } from '@api/collections/brands/constants/strategy-templates.constant';
import { ApplyBrandKitDto } from '@api/collections/brands/dto/apply-brand-kit.dto';
import { CrawlBrandKitDto } from '@api/collections/brands/dto/crawl-brand-kit.dto';
import { CreateBrandDto } from '@api/collections/brands/dto/create-brand.dto';
import { GenerateBrandVoiceDto } from '@api/collections/brands/dto/generate-brand-voice.dto';
import { GenerateFastlaneIdeasDto } from '@api/collections/brands/dto/generate-fastlane-ideas.dto';
import { ImportBrandKitAssetsDto } from '@api/collections/brands/dto/import-brand-kit-assets.dto';
import { ManualBrandKitDto } from '@api/collections/brands/dto/manual-brand-kit.dto';
import { ToggleBrandSkillDto } from '@api/collections/brands/dto/toggle-brand-skill.dto';
import { UpdateBrandDto } from '@api/collections/brands/dto/update-brand.dto';
import { UpdateBrandAgentConfigDto } from '@api/collections/brands/dto/update-brand-agent-config.dto';
import { type BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import { BrandSetupService } from '@api/collections/brands/services/brand-setup.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ImagesService } from '@api/collections/images/services/images.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { LinksService } from '@api/collections/links/services/links.service';
import { MusicsService } from '@api/collections/musics/services/musics.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { AnalyticsAggregationService } from '@api/collections/posts/services/analytics-aggregation.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { BrandSetupDto } from '@api/endpoints/onboarding/dto/brand-setup.dto';
import { AddReferenceImagesDto } from '@api/endpoints/onboarding/dto/reference-images.dto';
import { Cache } from '@api/helpers/decorators/cache/cache.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { BrandCreditsGuard } from '@api/helpers/guards/brand-credits/brand-credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import {
  getIsSuperAdmin,
  getPublicMetadata,
} from '@api/helpers/utils/auth/auth.util';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import { BaseService } from '@api/shared/services/base/base.service';
import { ActivityKey, ActivitySource } from '@genfeedai/enums';
import type {
  IBrandKitAssetImportResponse,
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/interfaces';
import { BrandSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
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
    public readonly ingredientsService: IngredientsService,
    public readonly linksService: LinksService,
    public readonly organizationSettingsService: OrganizationSettingsService,
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

    // Brand rename that cascades to the owning organization's name/slug. The
    // cascade itself is gated server-side to the first-login window inside the
    // service, so this flag cannot rename an established organization.
    const label = (rest as { label?: string }).label;
    if (syncOrganizationName && typeof label === 'string' && label.trim()) {
      await this.verifyBrandAccess(id, user);
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
      const renamed = await this.brandsService.findOne({ _id: id });
      return serializeSingle(request, BrandSerializer, renamed);
    }

    const requestedOrgId = (rest as { organizationId?: string }).organizationId;

    // No org change requested → default CRUD patch. Drop any stray consent token so it
    // never reaches a column-level update (it is only meaningful on a relocation).
    if (!requestedOrgId) {
      const { relocationAck: _omitAck, ...restWithoutAck } = rest as Record<
        string,
        unknown
      >;
      return super.patch(request, user, id, restWithoutAck as UpdateBrandDto);
    }

    const existing = (await this.brandsService.findOne({ _id: id })) as
      | (BrandDocument & { organizationId?: string })
      | null;
    if (!existing) {
      throw new HttpException(
        { detail: `Brand ${id} not found`, title: 'Not Found' },
        HttpStatus.NOT_FOUND,
      );
    }

    // Same org → not a relocation; apply the remaining fields via the default patch.
    // Strip both the org trigger and the consent token — neither is a Brand column, so
    // a retry that lands here after the move already committed would otherwise try to
    // persist `relocationAck` and be rejected by Prisma.
    if (existing.organizationId === requestedOrgId) {
      const {
        organizationId: _omitOrg,
        relocationAck: _omitAck,
        ...fields
      } = rest as Record<string, unknown>;
      return super.patch(request, user, id, fields as UpdateBrandDto);
    }

    const publicMetadata = getPublicMetadata(user);
    const { brand: moved, summary } =
      await this.brandsService.relocateToOrganization(id, updateDto, {
        isSuperAdmin: getIsSuperAdmin(user, request),
        userId: publicMetadata.user,
      });

    await this.activitiesService.create(
      new ActivityEntity({
        brand: id,
        key: ActivityKey.BRAND_RELOCATED,
        organization: requestedOrgId,
        source: ActivitySource.BRAND_RELOCATION,
        user: publicMetadata.user,
        value: JSON.stringify(summary),
      }),
    );

    return {
      ...serializeSingle(request, BrandSerializer, moved),
      meta: { ...summary },
    };
  }

  /**
   * Preview the impact of relocating a brand to another organization: how many
   * brand-owned workflows will move with it, and how many members will lose access.
   * `sharedWorkflows` and `ackToken` remain in the response for compatibility and
   * are always 0/null now that workflows are scoped to one brand.
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

    const publicMetadata = getPublicMetadata(user);
    const preview = await this.brandsService.previewRelocation(
      id,
      organizationId,
      {
        isSuperAdmin: getIsSuperAdmin(user, request),
        userId: publicMetadata.user,
      },
    );

    return { data: preview };
  }

  /**
   * Scrape a brand's website/socials, analyze with AI, and populate canonical
   * brand guidance. Renamed + rehomed from `POST /onboarding/brand-setup`
   * (REST audit #1354) — the 9-step orchestration lives behind BrandSetupService.
   */
  @Post(':id/scrape')
  @HttpCode(200)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async scrapeBrand(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: BrandSetupDto,
  ) {
    await this.verifyBrandAccess(id, user);
    return this.brandSetupService.setupBrand(id, dto, user);
  }

  /**
   * Add reference images (face, product, style, logo) to a brand. Rehomed from
   * `POST /onboarding/brand/:brandId/reference-images` (REST audit #1354).
   */
  @Post(':id/reference-images')
  @HttpCode(200)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async addReferenceImages(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: AddReferenceImagesDto,
  ) {
    await this.verifyBrandAccess(id, user);
    return this.brandSetupService.addReferenceImages(id, dto.images, user);
  }

  /**
   * Verify user has access to this brand
   * Throws HttpException if access is denied
   */
  private async verifyBrandAccess(
    brandId: string,
    user: User,
  ): Promise<BrandDocument> {
    const publicMetadata = getPublicMetadata(user);

    const brand = await this.brandsService.findOne({
      _id: brandId,
      OR: [
        { user: publicMetadata.user },
        { organization: publicMetadata.organization },
      ],
      isDeleted: false,
    });

    if (!brand) {
      if (!getIsSuperAdmin(user)) {
        throw new HttpException(
          {
            detail: 'Access denied to this brand',
            title: 'Forbidden',
          },
          HttpStatus.FORBIDDEN,
        );
      }

      throw new HttpException(
        {
          detail: 'Brand not found',
          title: 'Not Found',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    return brand;
  }

  @Post()
  @UseGuards(BrandCreditsGuard)
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
   * Override buildFindAllQuery to add logo and banner lookups
   */
  public buildFindAllQuery(user: User, query: BaseQueryDto) {
    const publicMetadata = getPublicMetadata(user);
    const adminFilter = CollectionFilterUtil.buildAdminFilter(
      publicMetadata,
      query,
    );

    const where: Record<string, unknown> = {
      isDeleted: query.isDeleted ?? false,
    };

    if (adminFilter) {
      Object.assign(where, adminFilter);
    } else {
      where.user = publicMetadata.user;
    }

    return {
      orderBy: handleQuerySort(query.sort),
      where,
    };
  }

  @Get('agent-config/strategy-templates')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  getStrategyTemplates() {
    return { data: STRATEGY_TEMPLATES };
  }

  @Get()
  @RolesDecorator('superadmin')
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
    // Call parent implementation
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

    const publicMetadata = getPublicMetadata(user);
    const brand = await this.brandsService.findOneBySlug({
      slug,
      OR: [
        { user: publicMetadata.user },
        { organization: publicMetadata.organization },
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

    return serializeSingle(request, BrandSerializer, brand);
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
    // Verify user has access to this brand
    await this.verifyBrandAccess(brandId, user);

    // Call parent implementation without caching
    return super.findOne(request, user, brandId);
  }

  @Patch(':id/agent-config')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async updateAgentConfig(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() updateAgentConfigDto: UpdateBrandAgentConfigDto,
  ): Promise<JsonApiSingleResponse> {
    const publicMetadata = getPublicMetadata(user);
    const organizationId = publicMetadata.organization?.toString();

    if (!organizationId) {
      throw new HttpException(
        {
          detail: 'Organization context is required',
          title: 'Forbidden',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    if (updateAgentConfigDto.defaultAvatarIngredientId !== undefined) {
      if (updateAgentConfigDto.defaultAvatarIngredientId !== null) {
        const avatarIngredient =
          await this.ingredientsService.findAvatarImageById(
            updateAgentConfigDto.defaultAvatarIngredientId,
            organizationId,
          );

        if (!avatarIngredient) {
          throw new BadRequestException(
            'Default avatar must reference an avatar image ingredient in this organization',
          );
        }
      }
    }

    const updatedBrand = await this.brandsService.updateAgentConfig(
      id,
      organizationId,
      updateAgentConfigDto,
    );

    if (!updatedBrand) {
      throw new HttpException(
        {
          detail: 'Brand not found',
          title: 'Not Found',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    return serializeSingle(request, BrandSerializer, updatedBrand);
  }

  @Post(':id/brand-kit/crawl')
  @HttpCode(200)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async crawlBrandKitWebsite(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: CrawlBrandKitDto,
  ) {
    await this.verifyBrandAccess(id, user);

    const publicMetadata = getPublicMetadata(user);
    const organizationId = publicMetadata.organization?.toString();

    if (!organizationId) {
      throw new HttpException(
        {
          detail: 'Organization context is required',
          title: 'Forbidden',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    const draft = await this.brandsService.crawlWebsiteBrandKitDraft(
      id,
      organizationId,
      dto,
    );

    return { data: draft };
  }

  @Post(':id/brand-kit/apply')
  @HttpCode(200)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async applyBrandKitDraft(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: ApplyBrandKitDto,
  ) {
    await this.verifyBrandAccess(id, user);

    const publicMetadata = getPublicMetadata(user);
    const organizationId = publicMetadata.organization?.toString();

    if (!organizationId) {
      throw new HttpException(
        {
          detail: 'Organization context is required',
          title: 'Forbidden',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    const result = await this.brandsService.applyBrandKitDraft(
      id,
      organizationId,
      dto,
    );

    return { data: result };
  }

  @Post(':id/brand-kit/manual')
  @HttpCode(200)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async createManualBrandKitDraft(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: ManualBrandKitDto,
  ) {
    await this.verifyBrandAccess(id, user);

    const publicMetadata = getPublicMetadata(user);
    const organizationId = publicMetadata.organization?.toString();

    if (!organizationId) {
      throw new HttpException(
        {
          detail: 'Organization context is required',
          title: 'Forbidden',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    const draft = await this.brandsService.buildManualBrandKitDraft(
      id,
      organizationId,
      dto,
    );

    return { data: draft };
  }

  @Post(':id/brand-kit/assets/import')
  @HttpCode(200)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async importBrandKitAssets(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: ImportBrandKitAssetsDto,
  ): Promise<{ data: IBrandKitAssetImportResponse }> {
    await this.verifyBrandAccess(id, user);

    const publicMetadata = getPublicMetadata(user);
    const organizationId = publicMetadata.organization?.toString();
    const userId = publicMetadata.user?.toString();

    if (!organizationId || !userId) {
      throw new HttpException(
        {
          detail: 'Organization and user context are required',
          title: 'Forbidden',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    const result = await this.brandsService.importBrandKitAssets(
      id,
      organizationId,
      userId,
      dto,
    );

    return { data: result };
  }

  @Post(':id/agent-config/generate-voice')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async generateBrandVoice(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() generateBrandVoiceDto: GenerateBrandVoiceDto,
  ) {
    const publicMetadata = getPublicMetadata(user);
    const organizationId = publicMetadata.organization?.toString();

    if (!organizationId) {
      throw new HttpException(
        {
          detail: 'Organization context is required',
          title: 'Forbidden',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    // If no URL or brandId provided, default to using this brand
    if (!generateBrandVoiceDto.url && !generateBrandVoiceDto.brandId) {
      generateBrandVoiceDto.brandId = id;
    }

    const voice = await this.brandsService.generateBrandVoice(
      generateBrandVoiceDto,
      organizationId,
    );

    return { data: voice };
  }

  @Post(':id/fastlane/ideas')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async generateFastlaneIdeas(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() generateFastlaneIdeasDto: GenerateFastlaneIdeasDto,
  ) {
    const publicMetadata = getPublicMetadata(user);
    const organizationId = publicMetadata.organization?.toString();

    if (!organizationId) {
      throw new HttpException(
        {
          detail: 'Organization context is required',
          title: 'Forbidden',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    // Backend flag guard: the studio `studio` FeatureGate does NOT enforce
    // isFastlaneEnabled, so a direct call here must be rejected when the org
    // flag is off — before any LLM work is metered.
    const settings = await this.organizationSettingsService.findOne({
      isDeleted: false,
      organization: organizationId,
    });

    if (!settings?.isFastlaneEnabled) {
      throw new HttpException(
        {
          detail: 'Fastlane is not enabled for this organization',
          title: 'Forbidden',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    const ideas = await this.brandsService.generateFastlaneIdeas(
      id,
      generateFastlaneIdeasDto,
      organizationId,
    );

    return { data: ideas };
  }

  @Patch(':id/agent-config/enabled-skills')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async updateEnabledSkills(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() toggleDto: ToggleBrandSkillDto,
  ): Promise<JsonApiSingleResponse> {
    const publicMetadata = getPublicMetadata(user);
    const organizationId = publicMetadata.organization?.toString();

    if (!organizationId) {
      throw new HttpException(
        {
          detail: 'Organization context is required',
          title: 'Forbidden',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    const updatedBrand = await this.brandsService.updateAgentConfig(
      id,
      organizationId,
      { enabledSkills: toggleDto.enabledSkills } as UpdateBrandAgentConfigDto,
    );

    if (!updatedBrand) {
      throw new HttpException(
        {
          detail: 'Brand not found or update failed',
          title: 'Not Found',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    return serializeSingle(request, BrandSerializer, updatedBrand);
  }
}
