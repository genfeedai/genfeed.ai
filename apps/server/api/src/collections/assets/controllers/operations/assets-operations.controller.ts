/**
 * Assets Operations Controller
 * Handles asset operation routes:
 * - Generate assets with AI
 * - Upload assets
 * - Create assets from ingredients
 */

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreateAssetDto } from '@api/collections/assets/dto/create-asset.dto';
import { CreateFromIngredientDto } from '@api/collections/assets/dto/create-from-ingredient.dto';
import { GenerateAssetDto } from '@api/collections/assets/dto/generate-asset.dto';
import { AssetsService } from '@api/collections/assets/services/assets.service';
import { getAssetParentId } from '@api/collections/assets/utils/asset-parent.util';
import { type BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { Credits } from '@api/helpers/decorators/credits/credits.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { ValidationException } from '@api/helpers/exceptions/http/validation.exception';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { UploadValidationPipe } from '@api/helpers/pipes/upload-validation';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import { EntityIdUtil } from '@api/helpers/utils/entity-id/entity-id.util';
import { InputValidationUtil } from '@api/helpers/utils/input-validation/input-validation.util';
import {
  returnNotFound,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import { CacheService } from '@api/services/cache/services/cache.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { MODEL_KEYS } from '@genfeedai/constants';
import {
  ActivitySource,
  AssetCategory,
  AssetParent,
  FileInputType,
  IngredientCategory,
  ModelCategory,
} from '@genfeedai/enums';
import type { JsonApiSingleResponse } from '@genfeedai/interfaces';
import { AssetSerializer } from '@genfeedai/serializers';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  Body,
  Controller,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FilesClientService } from '@server/services/files-microservice/client/files-client.service';
import { ReplicateService } from '@server/services/integrations/replicate/services/replicate.service';
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
    private readonly cacheService: CacheService,
    private readonly filesClientService: FilesClientService,
    private readonly ingredientsService: IngredientsService,
    private readonly loggerService: LoggerService,
    private readonly metadataService: MetadataService,
    private readonly promptBuilderService: PromptBuilderService,
    private readonly replicateService: ReplicateService,
    private readonly websocketService: NotificationsPublisherService,
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
    const publicMetadata = getPublicMetadata(user);

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
    ).toLowerCase() as AssetCategory;

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
          isDeleted: false,
          organizationId: publicMetadata.organization,
        });
      } catch (error) {
        this.loggerService.error(`${url} - Failed to fetch brand`, error);
        // Continue without brand if fetch fails
      }
    }

    const selectedModel = this.configService.isProduction
      ? MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA
      : MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_3_FAST;

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
        userId: publicMetadata.user,
      },
      { isDeleted: true },
    );

    const assetData = await this.assetsService.create({
      category,
      parentId,
      parentType: generateAssetDto.parentType,
      userId: publicMetadata.user,
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
      publicMetadata.organization,
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

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB max for assets
      },
    }),
  )
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async createUpload(
    @Req() request: Request,
    @CurrentUser() user: User,
    @UploadedFile(
      new UploadValidationPipe({
        allowedExtensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
        allowedMimeTypes: [
          'image/jpeg',
          'image/jpg',
          'image/png',
          'image/webp',
          'image/gif',
        ],
        maxSizeBytes: 50 * 1024 * 1024,
      }),
    )
    file: Express.Multer.File,
    @Body() uploadDto: CreateAssetDto,
  ): Promise<JsonApiSingleResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`, { category: uploadDto.category });

    const contentType = file.mimetype;
    const publicMetadata = getPublicMetadata(user);

    try {
      const entityData = {
        category: uploadDto.category,
        parentId:
          uploadDto.parentId && isEntityId(uploadDto.parentId)
            ? uploadDto.parentId
            : undefined,
        parentType: uploadDto.parentType,
        userId: publicMetadata.user,
      };

      this.loggerService.log(`${url} - Creating asset with data`, {
        entityData: {
          ...entityData,
          parentId: entityData.parentId,
          userId: entityData.userId,
        },
      });

      if (
        (uploadDto.category === AssetCategory.LOGO ||
          uploadDto.category === AssetCategory.BANNER) &&
        entityData.parentId &&
        uploadDto.parentType === AssetParent.BRAND
      ) {
        await this.assetsService.patchAll(
          {
            category: uploadDto.category,
            isDeleted: false,
            parentBrandId: entityData.parentId,
            parentType: AssetParent.BRAND,
          },
          { isDeleted: true },
        );

        await this.cacheService.invalidateByTags([
          'brands',
          'links',
          'assets',
          'public',
        ]);

        if (uploadDto.parentId) {
          try {
            await this.cacheService.del(`brand:${uploadDto.parentId}`);
          } catch (_error) {
            // Ignore if key doesn't exist
          }
        }
      }

      const assetData = await this.assetsService.create(entityData);

      this.loggerService.log(`${url} - Asset created successfully`, {
        assetId: assetData.id,
        category: assetData.category,
        parentId: getAssetParentId(assetData),
        parentType: assetData.parentType,
      });

      await this.filesClientService.uploadToS3(
        assetData.id,
        `${uploadDto.category}s`,
        {
          contentType,
          data: file.buffer,
          type: FileInputType.BUFFER,
        },
      );

      const userId = publicMetadata.user;
      if (userId) {
        await this.websocketService.publishAssetStatus(
          assetData.id.toString(),
          'completed',
          userId,
          {
            assetId: assetData.id.toString(),
            category: assetData.category,
            parentId: getAssetParentId(assetData),
            parentType: assetData.parentType,
          },
        );

        if (
          uploadDto.parentId &&
          [AssetCategory.LOGO, AssetCategory.BANNER].includes(
            uploadDto.category,
          )
        ) {
          await this.websocketService.publishBrandRefresh(
            uploadDto.parentId,
            userId,
            {
              assetId: assetData.id.toString(),
              category: uploadDto.category,
            },
          );
        }

        this.loggerService.log(`${url} - Published websocket event`, {
          assetId: assetData.id,
          category: assetData.category,
          userId,
        });
      }

      this.loggerService.log(`${url} completed`);
      return serializeSingle(request, AssetSerializer, assetData);
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  @Post('from-ingredient')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async createFromIngredient(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() createFromIngredientDto: CreateFromIngredientDto,
  ): Promise<JsonApiSingleResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`);

    const publicMetadata = getPublicMetadata(user);

    // Validate inputs
    const validatedIngredientId = InputValidationUtil.validateEntityId(
      createFromIngredientDto.ingredientId,
      'ingredientId',
    );

    const validatedCategory = createFromIngredientDto.category;

    if (
      ![AssetCategory.LOGO, AssetCategory.BANNER].includes(validatedCategory)
    ) {
      throw new ValidationException('Category must be logo or banner');
    }

    const validatedParent = InputValidationUtil.validateEntityId(
      createFromIngredientDto.parentId,
      'parentId',
    );

    // Get ingredient with metadata
    const ingredient = await this.ingredientsService.findOne({
      id: validatedIngredientId,
      isDeleted: false,
      userId: publicMetadata.user,
    });

    if (!ingredient) {
      return returnNotFound('Ingredient', validatedIngredientId);
    }

    if (String(ingredient.category) !== IngredientCategory.IMAGE) {
      throw new ValidationException('Only images can be set as logo or banner');
    }

    if (!ingredient.metadataId) {
      throw new ValidationException('Ingredient metadata not found');
    }

    const metadata = await this.metadataService.findOne({
      id: ingredient.metadataId,
      isDeleted: false,
    });

    if (!metadata) {
      throw new ValidationException('Ingredient metadata not found');
    }

    const ingredientType = 'images';
    const sourceKey = `ingredients/${ingredientType}/${validatedIngredientId}`;

    const parentId = validatedParent;
    await this.assetsService.patchAll(
      {
        category: validatedCategory,
        isDeleted: false,
        parentBrandId: parentId,
        parentType: AssetParent.BRAND,
      },
      { isDeleted: true },
    );

    const assetData = await this.assetsService.create({
      category: validatedCategory,
      parentId,
      parentType: AssetParent.BRAND,
      userId: publicMetadata.user,
    });

    const destinationKey = `ingredients/${validatedCategory}s/${assetData.id}`;

    try {
      // Extract source type and key from sourceKey (format: ingredients/{type}/{id})
      const sourceMatch = sourceKey.match(/ingredients\/([^/]+)\/(.+)$/);
      const sourceType = sourceMatch ? sourceMatch[1] : undefined;
      const sourceKeyOnly = sourceMatch
        ? sourceMatch[2]
        : sourceKey.replace(/^ingredients\/[^/]+\//, '');

      // Extract destination key (format: ingredients/{type}/{id})
      const destKeyOnly = assetData.id.toString();

      await this.filesClientService.copyInS3(
        sourceKeyOnly,
        destKeyOnly,
        sourceType,
        `${validatedCategory}s`,
      );
    } catch (error) {
      this.loggerService.error(`${url} - Failed to copy file from S3`, {
        destinationKey,
        error,
        sourceKey,
      });

      await this.assetsService.remove(assetData.id);

      throw new ValidationException(
        'Failed to copy ingredient file. The source file may not exist or there was an S3 error.',
      );
    }

    await this.cacheService.invalidateByTags([
      'brands',
      'links',
      'assets',
      'public',
    ]);

    if (validatedParent) {
      try {
        await this.cacheService.del(`brand:${validatedParent}`);
      } catch (_error) {
        // Ignore if key doesn't exist
      }
    }

    const userId = publicMetadata.user;
    if (userId) {
      await this.websocketService.publishAssetStatus(
        assetData.id.toString(),
        'completed',
        userId,
        {
          assetId: assetData.id.toString(),
          category: assetData.category,
          parentId: getAssetParentId(assetData),
          parentType: assetData.parentType,
        },
      );

      if (validatedParent) {
        await this.websocketService.publishBrandRefresh(
          validatedParent.toString(),
          userId,
          {
            assetId: assetData.id.toString(),
            category: validatedCategory,
          },
        );
      }
    }

    this.loggerService.log(`${url} completed`, {
      assetId: assetData.id,
      category: validatedCategory,
      ingredientId: validatedIngredientId,
    });

    return serializeSingle(request, AssetSerializer, assetData);
  }
}
