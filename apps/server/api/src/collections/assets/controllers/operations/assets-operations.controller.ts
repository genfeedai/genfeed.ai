/**
 * Assets Operations Controller
 * Handles AI asset generation.
 */

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { GenerateAssetDto } from '@api/collections/assets/dto/generate-asset.dto';
import { AssetsService } from '@api/collections/assets/services/assets.service';
import { type BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { ValidationException } from '@api/exceptions/validation.exception';
import { Credits } from '@api/helpers/decorators/credits/credits.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { EntityIdUtil } from '@api/helpers/utils/entity-id/entity-id.util';
import { InputValidationUtil } from '@api/helpers/utils/input-validation/input-validation.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { isCloudDeployment } from '@genfeedai/config';
import {
  ActivitySource,
  AssetCategory,
  AssetParent,
  ModelCategory,
} from '@genfeedai/contracts';
import {
  CLOUD_QUALITY_IMAGE_MODEL_KEY,
  LOWEST_COST_IMAGE_MODEL_KEY,
} from '@genfeedai/contracts/constants';
import type { JsonApiSingleResponse } from '@genfeedai/contracts/interfaces';
import { AssetSerializer } from '@genfeedai/serializers';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Request } from 'express';

function buildBrandAssetPrompt(
  brand: BrandDocument,
  promptPrefix: string,
): string {
  const brandInfo = [`${promptPrefix} for ${brand.label}`];

  if (brand.description) {
    brandInfo.push(brand.description);
  }

  if (brand.primaryColor && brand.primaryColor !== '#000000') {
    brandInfo.push(`Primary color: ${brand.primaryColor}`);
  }

  if (brand.secondaryColor && brand.secondaryColor !== '#FFFFFF') {
    brandInfo.push(`Secondary color: ${brand.secondaryColor}`);
  }

  brandInfo.push('Style: modern, clean, professional');

  return brandInfo.join('. ');
}

@AutoSwagger()
@Controller('assets')
@UseGuards(RolesGuard)
export class AssetsOperationsController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly assetsService: AssetsService,
    private readonly brandsService: BrandsService,
    private readonly loggerService: LoggerService,
    private readonly promptBuilderService: PromptBuilderService,
    private readonly replicateService: ReplicateService,
  ) {}

  @Post('generate')
  @Credits({
    amount: 200, // price for nano banana
    description: 'Asset generation',
    source: ActivitySource.ASSET_GENERATION,
  })
  @UseGuards(SubscriptionGuard, CreditsGuard)
  @UseInterceptors(CreditsInterceptor)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async generate(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() generateAssetDto: GenerateAssetDto,
  ): Promise<JsonApiSingleResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    if (generateAssetDto.parentType !== AssetParent.BRAND) {
      throw new ValidationException(
        'Logo and banner generation requires a brand parent',
      );
    }
    const parentId = await EntityIdUtil.validate(
      generateAssetDto.parentId,
      'parentId',
    );

    const category = InputValidationUtil.validateString(
      generateAssetDto.category,
      'category',
      {
        maxLength: 50,
      },
    ).toUpperCase() as AssetCategory;

    const text = InputValidationUtil.validateString(
      generateAssetDto.text,
      'text',
    );

    if (![AssetCategory.LOGO, AssetCategory.BANNER].includes(category)) {
      throw new ValidationException('Invalid asset type');
    }

    const { width, height } =
      category === AssetCategory.BANNER
        ? { height: 1080, width: 1920 }
        : { height: 1024, width: 1024 };

    let brand: BrandDocument | null = null;
    const brandIdToUse = parentId;

    if (brandIdToUse) {
      try {
        brand = await this.brandsService.findOne({
          id: brandIdToUse,
          organizationId: user.organizationId,
        });
      } catch (error) {
        this.loggerService.error(`${url} - Failed to fetch brand`, error);
        // Continue without brand if fetch fails
      }
    }

    const selectedModel =
      this.configService.isProduction && isCloudDeployment()
        ? CLOUD_QUALITY_IMAGE_MODEL_KEY
        : LOWEST_COST_IMAGE_MODEL_KEY;

    // Build enhanced prompt using brand information
    let enhancedPrompt = text;
    if (brand && category === AssetCategory.BANNER) {
      enhancedPrompt = buildBrandAssetPrompt(
        brand,
        'Generate a professional landscape banner (1920x1080)',
      );
    } else if (brand && category === AssetCategory.LOGO) {
      enhancedPrompt = buildBrandAssetPrompt(
        brand,
        'Generate a professional logo (1024x1024)',
      );
    } else if (category === AssetCategory.BANNER) {
      enhancedPrompt = `Generate a professional landscape banner (1920x1080). ${text}`;
    } else if (category === AssetCategory.LOGO) {
      enhancedPrompt = `Generate a professional logo (1024x1024). ${text}`;
    }

    // Replace the logo / banner
    await this.assetsService.patchAll(
      {
        category,
        parentBrandId: parentId,
        parentType: AssetParent.BRAND,
        userId: user.userId ?? user.id,
      },
      { isDeleted: true },
    );

    const assetData = await this.assetsService.create({
      category,
      parentId,
      parentType: generateAssetDto.parentType,
      userId: user.userId ?? user.id,
    });

    const { input: promptParams } = await this.promptBuilderService.buildPrompt(
      selectedModel as string,
      {
        brand: brand
          ? {
              label: brand.label,
              primaryColor: brand.primaryColor,
              secondaryColor: brand.secondaryColor,
              text: brand.text ?? undefined,
            }
          : undefined,
        height,
        modelCategory: ModelCategory.IMAGE,
        prompt: enhancedPrompt,
        style: 'natural',
        width,
      },
      user.organizationId,
    );

    const generationId = await this.replicateService.generateTextToImage(
      selectedModel as string,
      promptParams,
    );

    if (!generationId) {
      throw new ValidationException('Failed to start image generation');
    }

    await this.assetsService.patch(assetData.id, {
      externalId: generationId,
    });

    this.loggerService.log(`${url} - Replicate generation started`, {
      assetId: assetData.id,
      category,
      generationId,
    });

    return serializeSingle(request, AssetSerializer, assetData);
  }
}
