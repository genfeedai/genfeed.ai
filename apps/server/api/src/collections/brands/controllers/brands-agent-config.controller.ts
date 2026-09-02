import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BRAND_PROFILE_GENERATION_CREDIT_COST } from '@api/collections/brands/constants/brand-profile.constant';
import { verifyBrandAccess } from '@api/collections/brands/controllers/brand-access.helpers';
import { ApplyBrandKitDto } from '@api/collections/brands/dto/apply-brand-kit.dto';
import { CrawlBrandKitDto } from '@api/collections/brands/dto/crawl-brand-kit.dto';
import { GenerateBrandVoiceDto } from '@api/collections/brands/dto/generate-brand-voice.dto';
import { GenerateFastlaneIdeasDto } from '@api/collections/brands/dto/generate-fastlane-ideas.dto';
import { ImportBrandKitAssetsDto } from '@api/collections/brands/dto/import-brand-kit-assets.dto';
import { ManualBrandKitDto } from '@api/collections/brands/dto/manual-brand-kit.dto';
import { ToggleBrandSkillDto } from '@api/collections/brands/dto/toggle-brand-skill.dto';
import { UpdateBrandAgentConfigDto } from '@api/collections/brands/dto/update-brand-agent-config.dto';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { SkillsService } from '@api/collections/skills/services/skills.service';
import { BrandOsPreviewClaimDto } from '@api/endpoints/public/controllers/brand-os/brand-os-preview-claim.dto';
import { Credits } from '@api/helpers/decorators/credits/credits.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { ActivitySource } from '@genfeedai/contracts';
import type { JsonApiSingleResponse } from '@genfeedai/contracts/interfaces';
import {
  BrandKitApplySerializer,
  BrandKitAssetImportSerializer,
  BrandKitSerializer,
  BrandOsDraftHandoffSerializer,
  BrandSerializer,
} from '@genfeedai/serializers';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('brands')
@UseGuards(RolesGuard)
export class BrandsAgentConfigController {
  constructor(
    private readonly brandsService: BrandsService,
    private readonly ingredientsService: IngredientsService,
    private readonly organizationSettingsService: OrganizationSettingsService,
    private readonly skillsService: SkillsService,
  ) {}

  @Patch(':id/agent-config')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async updateAgentConfig(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() updateAgentConfigDto: UpdateBrandAgentConfigDto,
  ): Promise<JsonApiSingleResponse> {
    const organizationId = this.requireOrganizationId(user);

    if (updateAgentConfigDto.enabledSkills !== undefined) {
      await this.skillsService.assertAccessibleSkillSlugs(
        organizationId,
        updateAgentConfigDto.enabledSkills,
      );
    }

    if (
      updateAgentConfigDto.defaultAvatarIngredientId !== undefined &&
      updateAgentConfigDto.defaultAvatarIngredientId !== null
    ) {
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
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: CrawlBrandKitDto,
  ): Promise<JsonApiSingleResponse> {
    await verifyBrandAccess(this.brandsService, id, user);
    const organizationId = this.requireOrganizationId(user);
    const draft = await this.brandsService.crawlWebsiteBrandKitDraft(
      id,
      organizationId,
      dto,
    );

    return serializeSingle(request, BrandKitSerializer, draft);
  }

  @Post(':id/brand-kit/apply')
  @HttpCode(200)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async applyBrandKitDraft(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: ApplyBrandKitDto,
  ): Promise<JsonApiSingleResponse> {
    await verifyBrandAccess(this.brandsService, id, user);
    const organizationId = this.requireOrganizationId(user);
    const result = await this.brandsService.applyBrandKitDraft(
      id,
      organizationId,
      dto,
    );

    return serializeSingle(request, BrandKitApplySerializer, result);
  }

  @Post(':id/brand-kit/manual')
  @HttpCode(200)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async createManualBrandKitDraft(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: ManualBrandKitDto,
  ): Promise<JsonApiSingleResponse> {
    await verifyBrandAccess(this.brandsService, id, user);
    const organizationId = this.requireOrganizationId(user);
    const draft = await this.brandsService.buildManualBrandKitDraft(
      id,
      organizationId,
      dto,
    );

    return serializeSingle(request, BrandKitSerializer, draft);
  }

  @Post(':id/brand-kit/brand-os/claim')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async claimBrandOsPreview(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: BrandOsPreviewClaimDto,
  ): Promise<JsonApiSingleResponse> {
    await verifyBrandAccess(this.brandsService, id, user);
    const organizationId = this.requireOrganizationId(user);
    const handoff = await this.brandsService.claimBrandOsPreview(
      id,
      organizationId,
      dto.previewToken,
    );

    return serializeSingle(request, BrandOsDraftHandoffSerializer, handoff);
  }

  @Get(':id/brand-kit/brand-os')
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async readClaimedBrandOsPreview(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<JsonApiSingleResponse> {
    await verifyBrandAccess(this.brandsService, id, user);
    const organizationId = this.requireOrganizationId(user);
    const handoff = await this.brandsService.readClaimedBrandOsPreview(
      id,
      organizationId,
    );

    return serializeSingle(request, BrandOsDraftHandoffSerializer, handoff);
  }

  @Post(':id/brand-kit/assets/import')
  @HttpCode(200)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async importBrandKitAssets(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: ImportBrandKitAssetsDto,
  ): Promise<JsonApiSingleResponse> {
    await verifyBrandAccess(this.brandsService, id, user);

    const organizationId = user.organizationId?.toString();
    const userId = (user.userId ?? user.id)?.toString();

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

    return serializeSingle(request, BrandKitAssetImportSerializer, result);
  }

  @Post(':id/agent-config/generate-voice')
  @Credits({
    amount: BRAND_PROFILE_GENERATION_CREDIT_COST,
    description: 'AI brand profile generation',
    source: ActivitySource.SCRIPT,
  })
  @UseGuards(CreditsGuard)
  @UseInterceptors(CreditsInterceptor)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async generateBrandVoice(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() generateBrandVoiceDto: GenerateBrandVoiceDto,
  ) {
    const organizationId = this.requireOrganizationId(user);

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
    const organizationId = this.requireOrganizationId(user);
    const settings = await this.organizationSettingsService.findOne({
      organizationId: organizationId,
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
    const organizationId = this.requireOrganizationId(user);
    await this.skillsService.assertAccessibleSkillSlugs(
      organizationId,
      toggleDto.enabledSkills,
    );
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

  private requireOrganizationId(user: User): string {
    const organizationId = user.organizationId?.toString();

    if (!organizationId) {
      throw new HttpException(
        {
          detail: 'Organization context is required',
          title: 'Forbidden',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    return organizationId;
  }
}
