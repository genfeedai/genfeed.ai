import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { ArticlesService } from '@api/collections/articles/services/articles.service';
import { STRATEGY_TEMPLATES } from '@api/collections/brands/constants/strategy-templates.constant';
import { CreateBrandDto } from '@api/collections/brands/dto/create-brand.dto';
import { GenerateBrandVoiceDto } from '@api/collections/brands/dto/generate-brand-voice.dto';
import { UpdateBrandDto } from '@api/collections/brands/dto/update-brand.dto';
import { ToggleBrandSkillDto } from '@api/collections/brands/dto/toggle-brand-skill.dto';
import { UpdateBrandAgentConfigDto } from '@api/collections/brands/dto/update-brand-agent-config.dto';
import {
  Brand,
  type BrandDocument,
} from '@api/collections/brands/schemas/brand.schema';
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
import { Cache } from '@api/helpers/decorators/cache/cache.decorator';
import { Credits } from '@api/helpers/decorators/credits/credits.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { BrandCreditsGuard } from '@api/helpers/guards/brand-credits/brand-credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { BrandFilterUtil } from '@api/helpers/utils/brand-filter/brand-filter.util';
import {
  getIsSuperAdmin,
  getPublicMetadata,
} from '@api/helpers/utils/clerk/clerk.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import type { User } from '@clerk/backend';
import type {
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
  HttpException,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import { type PipelineStage, Types } from 'mongoose';

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
    @Inject(REQUEST) private readonly request: Request,

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
  ) {
    super(loggerService, brandsService as unknown, BrandSerializer, Brand.name);
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
      _id: new Types.ObjectId(brandId),
      $or: [
        { user: new Types.ObjectId(publicMetadata.user) },
        { organization: new Types.ObjectId(publicMetadata.organization) },
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
  @UseInterceptors(CreditsInterceptor)
  @Credits({ amount: 1_000, description: 'Create brand' })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() createDto: CreateBrandDto,
  ): Promise<JsonApiSingleResponse> {
    const enrichedDto = this.enrichCreateDto(createDto, user);

    const limit = (
      this.request as unknown as {
        brandsLimit?: { id: string; current: number };
      }
    ).brandsLimit;
    let limitUpdated = false;

    try {
      // Atomically update the brand limit to the new count before creating the brand
      if (limit) {
        await this.organizationSettingsService.updateBrandsLimit(
          limit.id,
          limit.current + 1,
        );

        limitUpdated = true;
      }

      const data: BrandDocument = await this.brandsService.create(enrichedDto);

      return serializeSingle(request, BrandSerializer, data);
    } catch (error: unknown) {
      // Rollback the limit to the original count if brand creation fails
      if (limitUpdated && limit) {
        await this.organizationSettingsService.updateBrandsLimit(
          limit.id,
          limit.current,
        );
      }
      throw error;
    }
  }

  /**
   * Override buildFindAllPipeline to add logo and banner lookups
   */
  public buildFindAllPipeline(
    user: User,
    query: BaseQueryDto,
  ): PipelineStage[] {
    const publicMetadata = getPublicMetadata(user);
    return [
      {
        $match: {
          isDeleted: query.isDeleted ?? false,
          user: new Types.ObjectId(publicMetadata.user),
        },
      },
      // Lookup brand assets (logo, banner, references, credentials)
      ...BrandFilterUtil.buildBrandAssetLookups(),
      {
        $sort: handleQuerySort(query.sort),
      },
    ];
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

  /**
   * Override findOne WITHOUT caching
   *
   * IMPORTANT: Caching disabled because brand has virtual populated fields
   * (links, credentials, references, logo, banner) fetched via Mongoose virtuals.
   * Caching populated virtuals causes stale data when related collections update.
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
